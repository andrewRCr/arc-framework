/** Atomic logical cohort renames with exact selected identity and read-only continuations. */
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult, StoreRefusal } from "./refusal.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences, sameReference, sameOwner, type RecordReference } from "./identity.js";
import { batchLifecycleWrites, recordPut, recordWritePlacement, readLifecycleMetaFields } from "./lifecycle-write.js";
import { observeRecords } from "./record-observations.js";
import { SlugSchema } from "../kernel/index.js";
import { holderCondition } from "./creation-admission.js";
import { rewriteCohortHeading, writeCohortParent, parseCohortDocument, rewriteCohortFilenameReferences } from "./kinds/cohort/index.js";
import { observeRenameFormerName, readRenameResolution } from "./rename-reference-resolution.js";
import { emptyRenameReport, type RenameReport, type RenameReportRecord } from "../work-unit/rename-report.js";
import type { RunRenameResult } from "../work-unit/verbs/rename.js";
import { observeAllHoldings, cohortHoldingRepairs, type CohortHolding, type CohortHoldingSegment } from "./kinds/cohort/check-support.js";
import { writeMetaCohort } from "./kinds/meta/writers.js";
import type { StoreView } from "./write-check.js";
import type { Mutation, RecordObservation } from "./write.js";
import { refuseParentConflicts } from "./cohort-rename-parent-conflicts.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
interface CohortRenameWrites { writes: Mutation[]; report: RenameReport; advisories: string[] }
interface CohortRenameEvidence { evidence: RecordReference[] }
/** A cohort rename's complete batch and the records its preparation read. */
export interface PreparedCohortRename extends CohortRenameWrites { records: StoreRecord[]; observations: RecordObservation[] }
interface CohortRenamePlan {
  primary: StoreRecord; target: string; records: StoreRecord[]; contents: Map<StoreRecord, string>;
  /** Each member Cohort path the batch writes. */
  paths: Map<StoreRecord, string>;
}

/** Rename the UID-selected cohort without any code-branch or checkout operation. */
export async function runCohortRename(store: Store, primary: StoreRecord,
  request: { operand: string; targetSlug: string }): Promise<RunRenameResult> {
  const closed = closedCohortRefusal(primary);
  if (closed !== undefined) return rejected(closed);
  const resuming = primary.reference.owner.name === request.targetSlug;
  if (resuming) {
    const collision = await checkCohortRenameTarget(store, primary, request.targetSlug);
    if (collision?.status === "refused") return rejected(collision.refusal);
  }
  const source = resuming ? await priorCohortName(store, primary) : { status: "ok" as const, result: primary.reference.owner.name };
  if (source.status === "refused") return rejected(source.refusal);
  if (source.result === request.targetSlug) return { status: "rejected", reason: "Rename needs distinct source and target names." };
  const reference = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: request.targetSlug } });
  let report = emptyRenameReport(), advisories: string[] = [];
  if (!resuming) {
    const prepared = await prepareCohortRenameBatch(store, primary, request.targetSlug);
    if (prepared.status === "refused") return rejected(prepared.refusal);
    const landed = await batchLifecycleWrites(store, prepared.result.writes, { verb: "rename", lifecycleAction: "rename" }, prepared.result.observations);
    if (landed.status === "refused") return rejected(landed.refusal);
    report = prepared.result.report; advisories = prepared.result.advisories;
  }
  const former = await observeRenameFormerName(store, source.result);
  return { status: "renamed", shape: "cohort", reference, sourceSlug: source.result, targetSlug: request.targetSlug,
    recordBatch: resuming ? "existing" : "applied", pendingIntegration: false,
    advisories: [...(resuming ? ["Cohort already renamed; no records changed."] : []), ...advisories, ...former.advisories],
    report: { ...report, formerSlugTies: former.ties } };
}

/** Prepare a cohort rename's batch from a store view alone, as the verb and its admission both do.
 * @param store - The store reads preparation makes.
 * @param primary - The cohort document being renamed.
 * @param target - The proposed name.
 * @returns The batch, its report and advisories, and every record preparation read, or its refusal.
 */
export async function prepareCohortRenameBatch(store: StoreView, primary: StoreRecord, target: string): Promise<StoreResult<PreparedCohortRename>> {
  const closed = closedCohortRefusal(primary);
  if (closed !== undefined) return { status: "refused", refusal: closed };
  const collision = await checkCohortRenameTarget(store, primary, target);
  if (collision?.status === "refused") return collision;
  const document = await prepareDocument(store, primary, target);
  if (document.status === "refused") return document;
  const read = [...document.result.records];
  const membership = await prepareMembershipWrites(store, primary, target, document.result);
  if (membership.status === "refused") return membership;
  const { evidence, ...prepared } = membership.result;
  const feeds = (record: StoreRecord): boolean => read.some(item => sameReference(item.reference, record.reference))
    || [...evidence, ...prepared.writes.map(write => write.reference)].some(reference => sameReference(reference, record.reference));
  return { status: "ok", result: { ...prepared, records: document.result.records,
    observations: observeRecords(document.result.records.filter(feeds)) } };
}

/** The records a holding's rewrite, retention, report row or advisory rests on. */
function holdingEvidence(holdings: readonly CohortHolding[]): RecordReference[] {
  const segments = (candidate: { segments: readonly CohortHoldingSegment[]; parent?: CohortHoldingSegment }) =>
    [...candidate.segments, ...(candidate.parent === undefined ? [] : [candidate.parent])]
      .flatMap(segment => segment.status === "known" ? [segment.reference] : []);
  return holdings.flatMap(holding => [holding.candidate.reference, ...segments(holding),
    ...holding.members.flatMap(member => [member.candidate.reference, ...segments(member)])]);
}

/** Refuse any other current or former holder of a cohort's proposed name. */
async function checkCohortRenameTarget(store: Pick<StoreView, "lookup">, primary: StoreRecord,
  target: string): Promise<StoreResult<never> | undefined> {
  const collision = await store.lookup({ kind: "slug", slug: SlugSchema.parse(target) });
  let references: RecordReference[];
  if (collision.status === "ok") {
    if (sameReference(collision.result.reference, primary.reference)) return undefined;
    references = [collision.result.reference];
  } else {
    if (collision.refusal.code !== "ambiguous-match") return collision.refusal.code === "not-found" ? undefined : collision;
    references = collision.refusal.candidates;
  }
  const condition = holderCondition(target, { kind: "refused", cause: "lookup", ambiguous: references.length > 1,
    holders: references.map(reference => ({ reference, name: reference.owner.name === target ? "current" : "former" })) });
  const remedy = { text: "Choose another slug." };
  return collision.status === "refused" ? { ...collision, refusal: { ...collision.refusal, condition, remedy } }
    : { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
      rule: "lifecycle.rename", condition, remedy } };
}

function closedCohortRefusal(primary: StoreRecord): StoreRefusal | undefined {
  return primary.placement?.kind !== "completed" ? undefined : { code: "unsupported", class: "terminal", case: "rename",
    condition: `Cohort ${primary.reference.owner.name} is already completed; a closed cohort cannot be renamed.`,
    remedy: { text: "Keep this closed cohort's name." } };
}

async function prepareMembershipWrites(store: StoreView, primary: StoreRecord, target: string,
  document: { content: string; records: StoreRecord[] }): Promise<StoreResult<CohortRenameWrites & CohortRenameEvidence>> {
  const view = capturedView(store, document.records), holdings = await observeAllHoldings(view, primary.reference);
  if (holdings.status !== "known") return malformed(primary, holdings.status === "unavailable" ? holdings.condition : "Cohort holdings are unavailable.");
  const retainedParents = coupledRetainedParents(holdings.value);
  const closed = retainedParents.filter(holding => holding.candidate.completed);
  const plan: CohortRenamePlan = { primary, target, records: document.records, contents: new Map([[primary, document.content]]), paths: new Map() };
  const membership = prepareSoleHoldings(plan, holdings.value, retainedParents);
  if (membership.status === "refused") return membership;
  const conflicts = await refuseParentConflicts(view, plan, holdings.value);
  if (conflicts.status === "refused") return conflicts;
  const retainedHoldings = holdings.value.filter(holding => holding.resolution === "ambiguous" || retainedParents.includes(holding) || holding.segments.some(segment => segment.status !== "known"));
  const retained = reportAmbiguousHoldings(plan, retainedHoldings, closed);
  if (retained.status === "refused") return retained;
  const disagreeing = reportDisagreeingPaths(plan, holdings.value, retained.result.report);
  if (disagreeing.status === "refused") return disagreeing;
  const filenames = await prepareFilenameReferences(view, plan, disagreeing.result);
  if (filenames.status === "refused") return filenames;
  return { status: "ok", result: { ...retained.result, report: filenames.result.report,
    evidence: [...holdingEvidence(holdings.value), ...filenames.result.evidence],
    writes: cohortRenameMutations(document.records, plan.contents, primary, target) } };
}

function coupledRetainedParents(holdings: readonly CohortHolding[]): CohortHolding[] {
  return holdings.filter(holding => holding.candidate.field === "parent" && (holding.resolution === "ambiguous"
    || holding.members.some(member => member.segments.slice(1).some(segment => segment.status !== "known")
      || (!holding.candidate.completed && !member.candidate.completed
        && !holdings.some(candidate => candidate.segment === 0 && candidate.resolution === "sole"
          && sameReference(candidate.candidate.reference, member.candidate.reference))))));
}

/** A member path whose first segment is not its leaf's current Parent has no consistent rewrite (A8): the batch keeps
 * it, and the report names the edit to the leaf's current path. Undefined for every path that agrees.
 */
function consistentLeafPath(holding: CohortHolding, plan: CohortRenamePlan): string | undefined {
  const leaf = holding.segments.at(-1);
  if (holding.candidate.field !== "cohort" || leaf?.status !== "known" || holding.segments.some(segment => segment.status !== "known")) return undefined;
  const parent = holding.parent, first = holding.segments.length === 2 ? holding.segments[0] : undefined;
  if (parent !== undefined && parent.status !== "known") return undefined;
  const agrees = parent === undefined ? first === undefined
    : first?.status === "known" && sameReference(first.reference, parent.reference);
  if (agrees) return undefined;
  const current = (segment: Extract<CohortHoldingSegment, { status: "known" }>): string =>
    sameReference(segment.reference, plan.primary.reference) ? plan.target : segment.currentSlug;
  return parent === undefined ? current(leaf) : `${current(parent)}/${current(leaf)}`;
}

function reportDisagreeingPaths(plan: CohortRenamePlan, holdings: readonly CohortHolding[], report: RenameReport): StoreResult<RenameReport> {
  const references = [...report.references];
  for (const holding of holdings) {
    const to = holding.resolution === "sole" ? consistentLeafPath(holding, plan) : undefined;
    if (to === undefined) continue;
    const record = holdingReportRecord(holding.candidate.reference);
    if (record === null) return malformed(plan.primary, "A retained holding has no exact owner identity.");
    references.push({ record, edits: [{ kind: "field", field: "cohort", from: holding.candidate.path, to }] });
  }
  return { status: "ok", result: { ...report, references } };
}

function prepareSoleHoldings(plan: CohortRenamePlan, holdings: readonly CohortHolding[], retainedParents: readonly CohortHolding[]): StoreResult<true> {
  const kept = retainedParents.flatMap(holding => [holding.candidate, ...holding.members.map(member => member.candidate)]);
  for (const holding of holdings) {
    if (holding.resolution !== "sole" || kept.some(candidate => sameReference(candidate.reference, holding.candidate.reference))) continue;
    if (consistentLeafPath(holding, plan) !== undefined) continue;
    const record = plan.records.find(item => sameReference(item.reference, holding.candidate.reference));
    if (record === undefined) return malformed(plan.primary, "A cohort holding has no captured record.");
    const path = currentHoldingPath(holding, plan.primary, plan.target);
    if (path === null) continue;
    const content = plan.contents.get(record) ?? record.content;
    if (holding.candidate.field === "cohort") plan.paths.set(record, path);
    plan.contents.set(record, holding.candidate.field === "cohort" ? writeMetaCohort(content, path) : writeCohortParent(content, path) ?? content);
  }
  return { status: "ok", result: true };
}

async function prepareFilenameReferences(view: StoreView, plan: CohortRenamePlan,
  report: RenameReport): Promise<StoreResult<{ report: RenameReport } & CohortRenameEvidence>> {
  const resolved = await readRenameResolution(view, plan.primary.reference, plan.primary.reference.owner.name);
  if (resolved.status === "refused") return resolved;
  const resolution = { result: resolved.result.resolution }, evidence = resolved.result.evidence.map(item => item.reference);
  if (resolution.result === "other") return { status: "ok", result: { report, evidence } };
  const eligible = await filenameRecords(view, plan.records);
  if (eligible.status === "refused") return eligible;
  const references = [...report.references];
  for (const record of eligible.result) {
    const content = plan.contents.get(record) ?? record.content;
    const rewritten = rewriteCohortFilenameReferences(content, plan.primary.reference.owner.name, plan.target);
    if (content === rewritten) continue;
    if (resolution.result === "subject") { plan.contents.set(record, rewritten); continue; }
    evidence.push(record.reference);
    const owner = holdingReportRecord(record.reference);
    if (owner === null) return malformed(plan.primary, "A filename reference has no exact holding owner identity.");
    const own = sameReference(record.reference, plan.primary.reference);
    const document = own ? RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: plan.target } }) : record.reference;
    const lines = content.split(/\r?\n/u);
    references.push({ record: own ? { ...owner, name: plan.target } : owner,
      edits: rewritten.split(/\r?\n/u).flatMap((replacement, index) => replacement === lines[index] ? []
        : [{ kind: "text" as const, document, line: index + 1, replacement }]) });
  }
  return { status: "ok", result: { report: { ...report, references }, evidence } };
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
  const kept = closed.flatMap(holding => [holding.candidate, ...holding.members.map(member => member.candidate)]);
  const open = holdings.filter(holding => !kept.some(candidate => sameReference(candidate.reference, holding.candidate.reference)));
  const planned = open.filter(holding => tiedClosedLeaf(holding, primary) === "plan");
  const edits = cohortHoldingRepairs(postBatchHoldings(planned, plan), target);
  if (edits.status !== "known") return malformed(primary, edits.status === "unavailable" ? edits.condition : "Holding edits are unavailable.");
  const references: Array<RenameReport["references"][number]> = edits.value.edits.map(({ record, ...edit }) => ({ record, edits: [{ kind: "field", ...edit }] }));
  const advisories: string[] = edits.value.deferred.map(group => group.condition
    + " Retain the reported fields, resolve the companion identity first, then have their owners choose the intended current path and clear Cohort before changing Parent and restoring membership.");
  for (const group of edits.value.deferred) {
    const added = appendReportHolders(references, group.candidates.map(candidate => candidate.reference), primary);
    if (added.status === "refused") return added;
  }
  const tied = reportTiedClosedLeaves(open.filter(holding => tiedClosedLeaf(holding, primary) === "disagrees"), primary, references, advisories);
  if (tied.status === "refused") return tied;
  for (const holding of closed) {
    advisories.push(closedHoldingAdvisory(holding));
    const added = appendReportHolders(references, [holding.candidate, ...holding.members.map(member => member.candidate)]
      .map(candidate => candidate.reference), primary);
    if (added.status === "refused") return added;
  }
  return { status: "ok", result: { report: { ...emptyRenameReport(), references }, advisories } };
}

/** How the planner treats a tied path over a closed leaf. It plans the path only where the leaf's Parent is the renamed
 * cohort or names the tied segment itself. A leaf whose Parent resolves to another cohort is that cohort's member, with no
 * edit here (A9); any other path disagrees with its leaf's Parent, so it is kept and reported as a sole one is (A8, A10).
 */
function tiedClosedLeaf(holding: CohortHolding, primary: StoreRecord): "plan" | "other" | "disagrees" {
  const leaf = holding.segments.at(-1), parent = holding.parent;
  if (holding.candidate.field !== "cohort" || holding.resolution !== "ambiguous" || leaf?.status !== "known"
    || leaf.resolutionRecord.placement?.kind !== "completed") return "plan";
  if (parent?.status === "known") return sameReference(parent.reference, primary.reference) ? "plan" : "other";
  return parent !== undefined && holding.segments.length === 2 && holding.segments[0]?.name === parent.name ? "plan" : "disagrees";
}

/** Report each kept tied path over a closed leaf: the edit to a top-level leaf's own slug, else its owner alone. */
function reportTiedClosedLeaves(holdings: readonly CohortHolding[], primary: StoreRecord,
  references: Array<RenameReport["references"][number]>, advisories: string[]): StoreResult<true> {
  for (const holding of holdings) {
    const leaf = holding.segments.at(-1), record = holdingReportRecord(holding.candidate.reference);
    if (record === null) return malformed(primary, "A retained holding has no exact owner identity.");
    if (holding.parent === undefined && leaf?.status === "known") {
      references.push({ record, edits: [{ kind: "field", field: "cohort", from: holding.candidate.path, to: leaf.currentSlug }] });
      continue;
    }
    advisories.push(`The path ${JSON.stringify(holding.candidate.path)} runs through a name this rename shares to closed cohort `
      + `${leaf?.name ?? ""}, whose Parent ${JSON.stringify(holding.parent?.name ?? null)} names no one cohort; its Cohort was kept `
      + "unchanged for its owner to choose the intended current path.");
    const added = appendReportHolders(references, [holding.candidate.reference], primary);
    if (added.status === "refused") return added;
  }
  return { status: "ok", result: true };
}

function appendReportHolders(references: Array<RenameReport["references"][number]>, candidates: readonly StoreRecord["reference"][],
  primary: StoreRecord): StoreResult<true> {
  for (const candidate of candidates) {
    const record = holdingReportRecord(candidate);
    if (record === null) return malformed(primary, "A retained holding has no exact owner identity.");
    if (!references.some(row => row.record.type === record.type && row.record.uid === record.uid)) references.push({ record, edits: [] });
  }
  return { status: "ok", result: true };
}

function closedHoldingAdvisory(holding: CohortHolding): string {
  const child = holding.candidate.reference.owner;
  return holding.resolution === "sole"
    ? `Closed subcohort ${child.name} has unresolved companion membership; Parent and member paths were kept unchanged.`
    : `Closed subcohort ${child.name} (${child.type === "person" ? "unavailable" : child.uid}) stays with the holder keeping ${JSON.stringify(holding.candidate.path)}; Parent and member paths were kept unchanged.`;
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

async function prepareDocument(store: StoreView, primary: StoreRecord, target: string): Promise<StoreResult<{ content: string; records: StoreRecord[] }>> {
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
