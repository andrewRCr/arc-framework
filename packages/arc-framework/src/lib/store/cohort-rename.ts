/** Atomic logical cohort renames with exact selected identity and read-only continuations. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, StoreRefusal } from "./refusal.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, sameReference } from "./identity.js";
import { batchLifecycleWrites, recordPut, recordWritePlacement } from "./lifecycle-write.js";
import { observeRecords } from "./record-observations.js";
import { checkCohortRenameTarget } from "./lifecycle-rename.js";
import { rewriteCohortHeading, writeCohortParent, parseCohortDocument } from "./kinds/cohort/index.js";
import { observeRenameFormerName } from "./rename-reference-resolution.js";
import { emptyRenameReport, type RenameReport, type RenameReportRecord } from "../work-unit/rename-report.js";
import type { RunRenameResult } from "../work-unit/verbs/rename.js";
import { observeAllHoldings, cohortHoldingEdits, type CohortHolding } from "./kinds/cohort/check-support.js";
import { writeMetaCohort } from "./kinds/meta/writers.js";
import type { StoreView } from "./write-check.js";
import type { Mutation } from "./write.js";
interface CohortRenameWrites { writes: Mutation[]; report: RenameReport; advisories: string[] }

/** Rename the UID-selected cohort without any code-branch or checkout operation. */
export async function runCohortRename(store: Store, primary: StoreRecord,
  request: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  if (primary.placement?.kind === "completed") return rejected({ code: "unsupported", class: "terminal", case: "rename",
    condition: `Cohort ${primary.reference.owner.name} is already completed; a closed cohort cannot be renamed.`,
    remedy: { text: "Keep this closed cohort's name." } });
  const collision = await checkCohortRenameTarget(store, primary, request.targetSlug);
  if (collision?.status === "refused") return rejected(collision.refusal);
  const resuming = primary.reference.owner.name === request.targetSlug;
  const source = resuming ? await priorCohortName(store, primary) : { status: "ok" as const, result: primary.reference.owner.name };
  if (source.status === "refused") return rejected(source.refusal);
  if (source.result === request.targetSlug) return { status: "rejected", reason: "Rename needs distinct source and target names." };
  const reference = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: request.targetSlug } });
  let report = emptyRenameReport(), advisories: string[] = [];
  if (!resuming) {
    const prepared = await prepareDocument(store, primary, request.targetSlug);
    if (prepared.status === "refused") return rejected(prepared.refusal);
    const membership = await prepareMembershipWrites(store, primary, request.targetSlug, prepared.result);
    if (membership.status === "refused") return rejected(membership.refusal);
    const landed = await batchLifecycleWrites(store, membership.result.writes, { verb: "rename", lifecycleAction: "rename" }, observeRecords(prepared.result.records));
    if (landed.status === "refused") return rejected(landed.refusal);
    report = membership.result.report; advisories = membership.result.advisories;
  }
  const former = await observeRenameFormerName(store, source.result);
  return { status: "renamed", shape: "cohort", reference, sourceSlug: source.result, targetSlug: request.targetSlug,
    recordBatch: resuming ? "existing" : "applied", pendingIntegration: false,
    advisories: [...(resuming ? ["Cohort already renamed; no records changed."] : []), ...advisories, ...former.advisories],
    report: { ...report, formerSlugTies: former.ties } };
}

async function prepareMembershipWrites(store: Store, primary: StoreRecord, target: string,
  document: { content: string; records: StoreRecord[] }): Promise<StoreResult<CohortRenameWrites>> {
  const holdings = await observeAllHoldings(capturedView(store, document.records), primary.reference);
  if (holdings.status !== "known") return malformed(primary, holdings.status === "unavailable" ? holdings.condition : "Cohort holdings are unavailable.");
  const closed = holdings.value.filter(holding => holding.resolution === "ambiguous" && holding.candidate.field === "parent" && holding.candidate.completed);
  const kept = closed.flatMap(holding => [holding.candidate, ...holding.members.map(member => member.candidate)]);
  const contents = new Map<StoreRecord, string>([[primary, document.content]]);
  for (const holding of holdings.value) {
    if (holding.resolution !== "sole" || kept.some(candidate => sameReference(candidate.reference, holding.candidate.reference))) continue;
    const record = document.records.find(item => sameReference(item.reference, holding.candidate.reference));
    if (record === undefined) return malformed(primary, "A cohort holding has no captured record.");
    const path = currentHoldingPath(holding, primary, target);
    if (path === null) return malformed(primary, `The cohort path ${holding.candidate.path} has an unresolved companion segment.`);
    const content = contents.get(record) ?? record.content;
    contents.set(record, holding.candidate.field === "cohort" ? writeMetaCohort(content, path) : writeCohortParent(content, path) ?? content);
  }
  const retained = reportAmbiguousHoldings(primary, holdings.value.filter(holding => holding.resolution === "ambiguous"), target, closed);
  if (retained.status === "refused") return retained;
  return { status: "ok", result: { ...retained.result, writes: cohortRenameMutations(document.records, contents, primary, target) } };
}

function cohortRenameMutations(records: readonly StoreRecord[], contents: ReadonlyMap<StoreRecord, string>, primary: StoreRecord, target: string): Mutation[] {
  return records.flatMap(record => {
    const content = contents.get(record) ?? record.content, own = sameReference(record.reference, primary.reference);
    if (!own && content === record.content) return [];
    const placement = recordWritePlacement(record);
    const write = recordPut(record, { content, ...(placement === undefined ? {} : { placement }) });
    if (own) write.reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: target } });
    return [write];
  });
}

function reportAmbiguousHoldings(primary: StoreRecord, holdings: readonly CohortHolding[], target: string,
  closed: readonly CohortHolding[]): StoreResult<Pick<CohortRenameWrites, "report" | "advisories">> {
  const edits = cohortHoldingEdits(holdings, target);
  if (edits.status !== "known") return malformed(primary, edits.status === "unavailable" ? edits.condition : "Holding edits are unavailable.");
  const references: Array<RenameReport["references"][number]> = edits.value.map(({ record, ...edit }) => ({ record, edits: [{ kind: "field", ...edit }] }));
  const advisories: string[] = [];
  for (const holding of closed) {
    const child = holding.candidate.reference.owner;
    advisories.push(`Closed subcohort ${child.name} (${child.type === "person" ? "unavailable" : child.uid}) stays with the holder keeping ${JSON.stringify(holding.candidate.path)}; Parent and member paths were kept unchanged.`);
    for (const candidate of [holding.candidate, ...holding.members.map(member => member.candidate)]) {
      const record = holdingReportRecord(candidate.reference);
      if (record === null) return malformed(primary, "The exact identity of a retained cohort holding is unavailable.");
      if (!references.some(row => row.record.type === record.type && row.record.uid === record.uid)) references.push({ record, edits: [] });
    }
  }
  return { status: "ok", result: { report: { ...emptyRenameReport(), references }, advisories } };
}

function holdingReportRecord(reference: StoreRecord["reference"]): RenameReportRecord | null {
  const owner = reference.owner;
  return owner.type === "person" || owner.uid === undefined ? null
    : { type: reference.kind === "cohort/document" ? "cohort" : "work-unit", name: owner.name, uid: owner.uid };
}

function currentHoldingPath(holding: CohortHolding, primary: StoreRecord, target: string): string | null {
  if (holding.segments.some(segment => segment.status !== "known")) return null;
  return holding.segments.map(segment => segment.status === "known"
    ? sameReference(segment.reference, primary.reference) ? target : segment.currentSlug : segment.name).join("/");
}

function capturedView(store: StoreView, records: StoreRecord[]): StoreView {
  return {
    lookup: input => store.lookup(input),
    read: async input => {
      const read = await store.read(input);
      return read.status === "refused" ? read : retainRecord(records, read.result);
    },
    list: async input => {
      const listed = await store.list(input);
      if (listed.status === "ok" && listed.result.status === "complete") for (const record of listed.result.records) {
        const retained = retainRecord(records, record);
        if (retained.status === "refused") return retained;
      }
      return listed;
    },
  };
}

async function prepareDocument(store: Store, primary: StoreRecord, target: string): Promise<StoreResult<{ content: string; records: StoreRecord[] }>> {
  const parsed = parseCohortDocument(primary.content), records = [primary];
  if (!parsed.success) return malformed(primary, parsed.error);
  let content = rewriteCohortHeading(primary.content, target);
  if (parsed.data.parent !== null) {
    const parent = await store.read({ reference: recordReferences["cohort/document"](
      OwnerIdentitySchema.parse({ type: "cohort", name: parsed.data.parent })) });
    if (parent.status === "refused") return parent;
    const retained = retainRecord(records, parent.result);
    if (retained.status === "refused") return retained;
    content = writeCohortParent(content, retained.result.reference.owner.name) ?? content;
  }
  return { status: "ok", result: { content, records } };
}

function retainRecord(records: StoreRecord[], record: StoreRecord): StoreResult<StoreRecord> {
  const prior = records.find(item => sameReference(item.reference, record.reference));
  if (prior === undefined) { records.push(record); return { status: "ok", result: record }; }
  if (prior.version === record.version && prior.conflicts.length === record.conflicts.length
    && prior.conflicts.every(reference => record.conflicts.some(other => sameReference(reference, other)))) return { status: "ok", result: prior };
  return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", records: [record.reference],
    condition: "Cohort rename observed inconsistent versions or conflicts for one record.",
    remedy: { text: "Read the current cohort evidence and retry rename." } } };
}

function malformed(primary: StoreRecord, condition: string): StoreResult<never> {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
    rule: "lifecycle.rename", condition, remedy: { text: "Repair the cohort document and retry rename." } } };
}

async function priorCohortName(store: Store, primary: StoreRecord): Promise<StoreResult<string>> {
  const history = await store.history({ reference: primary.reference });
  if (history.status === "refused") return history;
  return { status: "ok", result: history.result.find(entry => entry.reference.kind === "cohort/document"
    && entry.reference.owner.name !== primary.reference.owner.name)?.reference.owner.name ?? primary.reference.owner.name };
}

function rejected(refusal: StoreRefusal): Extract<RunRenameResult, { status: "rejected" }> {
  return { status: "rejected", reason: refusal.condition, refusal };
}
