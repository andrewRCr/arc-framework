/** Atomic logical cohort renames with exact selected identity and read-only continuations. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, StoreRefusal } from "./refusal.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, sameReference, sameOwner } from "./identity.js";
import { batchLifecycleWrites, recordPut, recordWritePlacement, readLifecycleMetaFields } from "./lifecycle-write.js";
import { observeRecords } from "./record-observations.js";
import { checkCohortRenameTarget } from "./rename-target-admission.js";
import { rewriteCohortHeading, writeCohortParent, parseCohortDocument, rewriteCohortFilenameReferences } from "./kinds/cohort/index.js";
import { observeRenameFormerName, resolveRenameReferences } from "./rename-reference-resolution.js";
import { emptyRenameReport, type RenameReport, type RenameReportRecord } from "../work-unit/rename-report.js";
import type { RunRenameResult } from "../work-unit/verbs/rename.js";
import { observeAllHoldings, cohortHoldingEdits, type CohortHolding, type CohortHoldingSegment } from "./kinds/cohort/check-support.js";
import { writeMetaCohort } from "./kinds/meta/writers.js";
import type { StoreView } from "./write-check.js";
import type { Mutation } from "./write.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
interface CohortRenameWrites { writes: Mutation[]; report: RenameReport; advisories: string[] }
interface CohortRenamePlan { primary: StoreRecord; target: string; records: StoreRecord[]; contents: Map<StoreRecord, string> }

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
  const view = capturedView(store, document.records), holdings = await observeAllHoldings(view, primary.reference);
  if (holdings.status !== "known") return malformed(primary, holdings.status === "unavailable" ? holdings.condition : "Cohort holdings are unavailable.");
  const retainedParents = coupledRetainedParents(holdings.value);
  const closed = retainedParents.filter(holding => holding.candidate.completed);
  const plan: CohortRenamePlan = { primary, target, records: document.records, contents: new Map([[primary, document.content]]) };
  const membership = prepareSoleHoldings(plan, holdings.value, retainedParents);
  if (membership.status === "refused") return membership;
  const retainedHoldings = holdings.value.filter(holding => holding.resolution === "ambiguous" || retainedParents.includes(holding));
  const retained = reportAmbiguousHoldings(plan, retainedHoldings, closed);
  if (retained.status === "refused") return retained;
  const filenames = await prepareFilenameReferences(view, plan, retained.result.report);
  if (filenames.status === "refused") return filenames;
  return { status: "ok", result: { ...retained.result, report: filenames.result,
    writes: cohortRenameMutations(document.records, plan.contents, primary, target) } };
}

function coupledRetainedParents(holdings: readonly CohortHolding[]): CohortHolding[] {
  return holdings.filter(holding => holding.candidate.field === "parent" && (holding.resolution === "ambiguous"
    || (!holding.candidate.completed && holding.members.some(member => !member.candidate.completed
      && !holdings.some(candidate => candidate.segment === 0 && candidate.resolution === "sole"
        && sameReference(candidate.candidate.reference, member.candidate.reference))))));
}

function prepareSoleHoldings(plan: CohortRenamePlan, holdings: readonly CohortHolding[], retainedParents: readonly CohortHolding[]): StoreResult<true> {
  const kept = retainedParents.flatMap(holding => [holding.candidate, ...holding.members.map(member => member.candidate)]);
  for (const holding of holdings) {
    if (holding.resolution !== "sole" || kept.some(candidate => sameReference(candidate.reference, holding.candidate.reference))) continue;
    const record = plan.records.find(item => sameReference(item.reference, holding.candidate.reference));
    if (record === undefined) return malformed(plan.primary, "A cohort holding has no captured record.");
    const path = currentHoldingPath(holding, plan.primary, plan.target);
    if (path === null) return malformed(plan.primary, `The cohort path ${holding.candidate.path} has an unresolved companion segment.`);
    const content = plan.contents.get(record) ?? record.content;
    plan.contents.set(record, holding.candidate.field === "cohort" ? writeMetaCohort(content, path) : writeCohortParent(content, path) ?? content);
  }
  return { status: "ok", result: true };
}

async function prepareFilenameReferences(view: StoreView, plan: CohortRenamePlan, report: RenameReport): Promise<StoreResult<RenameReport>> {
  const resolution = await resolveRenameReferences(view, plan.primary.reference, plan.primary.reference.owner.name);
  if (resolution.status === "refused") return resolution;
  if (resolution.result === "other") return { status: "ok", result: report };
  const eligible = await filenameRecords(view, plan.records);
  if (eligible.status === "refused") return eligible;
  const references = [...report.references];
  for (const record of eligible.result) {
    const content = plan.contents.get(record) ?? record.content;
    const rewritten = rewriteCohortFilenameReferences(content, plan.primary.reference.owner.name, plan.target);
    if (content === rewritten) continue;
    if (resolution.result === "subject") { plan.contents.set(record, rewritten); continue; }
    const owner = holdingReportRecord(record.reference);
    if (owner === null) return malformed(plan.primary, "A filename reference has no exact holding owner identity.");
    const own = sameReference(record.reference, plan.primary.reference);
    const document = own ? RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: plan.target } }) : record.reference;
    const lines = content.split(/\r?\n/u);
    references.push({ record: own ? { ...owner, name: plan.target } : owner,
      edits: rewritten.split(/\r?\n/u).flatMap((replacement, index) => replacement === lines[index] ? []
        : [{ kind: "text" as const, document, line: index + 1, replacement }]) });
  }
  return { status: "ok", result: { ...report, references } };
}

async function filenameRecords(view: StoreView, records: StoreRecord[]): Promise<StoreResult<readonly StoreRecord[]>> {
  const stubs: StoreRecord[] = [];
  for (const primary of records.filter(record => record.reference.kind === "work-item/meta" && record.placement?.kind === "backlog")) {
    const fields = readLifecycleMetaFields(primary);
    if (fields.status === "refused") return fields;
    if (fields.result.state !== "Planning") continue;
    const group = await acquireLifecycleRecords(view, primary.reference);
    if (group.status === "refused") return group;
    stubs.push(primary);
  }
  return { status: "ok", result: records.filter(record => record.reference.kind === "cohort/document"
    ? record.placement?.kind !== "completed"
    : record.reference.kind !== "work-item/cut-map" && stubs.some(stub => sameOwner(stub.reference.owner, record.reference.owner))) };
}

function cohortRenameMutations(records: readonly StoreRecord[], contents: ReadonlyMap<StoreRecord, string>, primary: StoreRecord, target: string): Mutation[] {
  return records.flatMap(record => {
    const content = contents.get(record) ?? record.content, own = sameReference(record.reference, primary.reference);
    if (!own && content === record.content) return [];
    const placement = record.reference.kind === "cohort/document" ? recordWritePlacement(record) : undefined;
    const write = recordPut(record, { content, ...(placement === undefined ? {} : { placement }) });
    if (own) write.reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: target } });
    return [write];
  });
}

function reportAmbiguousHoldings(plan: CohortRenamePlan, holdings: readonly CohortHolding[],
  closed: readonly CohortHolding[]): StoreResult<Pick<CohortRenameWrites, "report" | "advisories">> {
  const { primary, target } = plan;
  const edits = cohortHoldingEdits(postBatchHoldings(holdings, plan), target);
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

/** Repairs use persisted prerequisite content while retaining captured ownership and candidate identity. */
function postBatchHoldings(holdings: readonly CohortHolding[], plan: CohortRenamePlan): CohortHolding[] {
  return holdings.map(holding => ({ ...holding, segments: postBatchSegments(holding.segments, plan),
    members: holding.members.map(member => ({ ...member, segments: postBatchSegments(member.segments, plan) })) }));
}

function postBatchSegments(segments: readonly CohortHoldingSegment[], plan: CohortRenamePlan): CohortHoldingSegment[] {
  return segments.map(segment => {
    if (segment.status !== "known") return segment;
    const record = plan.records.find(candidate => sameReference(candidate.reference, segment.resolutionRecord.reference));
    const content = record === undefined ? undefined : plan.contents.get(record);
    return content === undefined ? segment : { ...segment, resolutionRecord: { ...segment.resolutionRecord, content } };
  });
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
