/** Atomic work-unit and cohort closeout over backend-assigned archive coordinates. */
import { posix } from "node:path";
import type { PushResult, SyncState } from "../../store/sync.js";
import { projectPull } from "../../store/operational-sync-bindings.js";
import type { Store } from "../../store/contract.js";
import { ArchiveQuarterSchema } from "../../kernel/index.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import type { RecordReference } from "../../store/identity.js";
import type { WritePlacement } from "../../store/placement.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../../store/identity.js";
import { identityKey, type LifecycleEntry } from "../../store/lifecycle-index.js";
import { readWorkUnit, recordPut, workUnitMetaPath, batchLifecycleWrites } from "../../store/lifecycle-write.js";
import { observeRecords } from "../../store/record-observations.js";
import { completedCohortPath } from "../../store/lifecycle-record-path.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { writeMetaSessionContext, writeMetaStateAtHandoff, writeMetaCommitAtHandoff, writeMetaSessionType } from "../../store/kinds/meta/writers.js";
import type { Mutation } from "../../store/write.js";
import type { StoreRecord } from "../../store/read.js";
import type { StoreRefusal, Remedy } from "../../store/refusal.js";
import type { TransitionOutcome } from "../lifecycle-executor.js";
import { executeTransition } from "../lifecycle-executor.js";
import { revalidateLifecycleRecords } from "../prepared-lifecycle-write.js";
import { observeOpenCohorts, observeCohortHoldings, describeCohortHoldings, cohortDocumentParent,
  type CohortEvidence, type CohortHoldingCandidate, type CohortHolding } from "../../store/kinds/cohort/check-support.js";
import { consumePull, pullOutcomeNotices, renderExplained } from "../../store/pull-consumption.js";
import { memberCohortReadRefusal } from "../../store/cohort-membership-refusal.js";
import type { ArchiveContext, ArchiveParams, ArchiveResult } from "./archive.js";

/** Close session context and every newly completed cohort in the transition's single batch. */
export async function runStoreArchive(ctx: ArchiveContext & { executor: ArchiveContext["executor"] & { store: Store } }, params: ArchiveParams): Promise<ArchiveResult> {
  const { store } = ctx.executor;
  const read = await readWorkUnit(store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result, parsed = ParsedMetaRecordSchema.safeParse(primary.fields);
  if (!parsed.success) {
    const reason = `Metadata fields for \`${params.name}\` could not be read.`;
    return { status: "rejected", reason, refusal: { code: "record-malformed", class: "recoverable",
      reference: primary.reference, rule: "lifecycle.archive-fields", condition: reason,
      remedy: { text: "Repair the work unit's metadata fields, then retry archive.", argv: ["arc", "archive", params.name] } } };
  }
  const meta = parsed.data;
  if (primary.placement?.kind === "completed" && meta.state === "Shipped" && meta.currentWorkflow === null) {
    return settleStoredArchive(ctx.executor.cwd, store, primary, completedOutcome());
  }
  const date = ctx.clock(), quarter = ArchiveQuarterSchema.parse(`${date.getFullYear()}-q${Math.floor(date.getMonth() / 3) + 1}`);
  const view = await readLifecycleView(ctx.executor.cwd, store);
  if (view.status === "refused") return { status: "rejected", reason: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { return { status: "rejected", reason: String(error) }; }
  if (!view.result.entries.some(entry => sameReference(entry.reference, primary.reference))) {
    return { status: "rejected", reason: "The archive subject is absent from complete lifecycle inventory." };
  }
  const prospective = archiveMemberCandidates(view.result.entries, primary.reference);
  const cohorts = await prepareArchiveCohorts(store, primary, prospective, quarter);
  if (cohorts.status === "rejected") return cohorts;
  const { writes } = cohorts;
  const content = writeMetaSessionType(writeMetaCommitAtHandoff(writeMetaStateAtHandoff(writeMetaSessionContext(primary.content, null), null), null), null);
  const outcome = await executeTransition(ctx.executor, { verb: "archive", slug: params.name, inputs: {
    suggestion: params.suggestion, storeTransition: { primary, content, placement: { kind: "completed", quarter }, additionalWrites: writes, preparedRecords: cohorts.records,
      observations: observeRecords(cohorts.completed) },
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message,
    ...("refusal" in outcome && outcome.refusal !== undefined ? { refusal: outcome.refusal } : {}),
    ...("remedy" in outcome && outcome.remedy !== undefined ? { remedy: outcome.remedy } : {}) };
  return settleStoredArchive(ctx.executor.cwd, store, primary, outcome);
}

// Every notice a push raised joins the archive's warnings, or the reason of any rejection after publication.
async function settleStoredArchive(checkoutRoot: string, store: Store, primary: StoreRecord, outcome: Extract<TransitionOutcome, { status: "ok" }>): Promise<ArchiveResult> {
  const notices: string[] = [], result = await settleStoredArchiveSteps(checkoutRoot, store, primary, outcome, notices);
  return result.status === "rejected" && notices.length ? { ...result, reason: `${result.reason} Also reported: ${notices.join(" ")}` } : result;
}

async function settleStoredArchiveSteps(checkoutRoot: string, store: Store, primary: StoreRecord, outcome: Extract<TransitionOutcome, { status: "ok" }>,
  notices: string[]): Promise<ArchiveResult> {
  const name = primary.reference.owner.name;
  try {
    const publication = await publishArchive(store, name, notices);
    if (publication !== undefined) return publication;
    for (;;) {
      const plan = await prepareStoredCloseout(checkoutRoot, store, primary);
      if (plan.status === "rejected") return plan;
      if (plan.writes.length === 0) return await reportStoredArchive(checkoutRoot, store, plan.primary, outcome,
        cohortReferencesFor(plan.cohort), [...notices, ...plan.notices]);
      const closeout = await publishCohortCloseout(store, name, plan, notices);
      if (closeout !== undefined) return closeout;
    }
  } catch (error) { return persistedFailure(name, error instanceof Error ? error.message : String(error)); }
}

async function prepareStoredCloseout(checkoutRoot: string, store: Store, primary: StoreRecord): Promise<
  { status: "ready"; primary: StoreRecord; cohort: string | null; writes: Mutation[]; records: StoreRecord[]; completed: StoreRecord[]; notices: string[] }
  | Extract<ArchiveResult, { status: "rejected" }>> {
  const name = primary.reference.owner.name;
  const current = await store.read({ reference: primary.reference });
  if (current.status === "refused") return reportFailure(name, current.refusal);
  const meta = ParsedMetaRecordSchema.parse(current.result.fields), placement = current.result.placement;
  if (placement?.kind !== "completed") throw new Error("The persisted archive no longer has completed placement.");
  const view = await readLifecycleView(checkoutRoot, store);
  if (view.status === "refused") return reportFailure(name, view.refusal);
  requireCompleteInventory(store, view.result.listing);
  const cohorts = await prepareArchiveCohorts(store, current.result, archiveMemberCandidates(view.result.entries), placement.quarter, false);
  return cohorts.status === "rejected" ? persistedFailure(name, cohorts.reason, cohorts.remedy, cohorts.refusal)
    : { ...cohorts, primary: current.result, cohort: meta.cohort };
}

function archiveMemberCandidates(entries: readonly LifecycleEntry[], completing?: RecordReference): CohortHoldingCandidate[] {
  const candidates: CohortHoldingCandidate[] = [];
  for (const entry of entries) {
    const completes = completing !== undefined && sameReference(entry.reference, completing);
    if (completes || entry.location === "completed" || entry.fields.cohort === null) continue;
    candidates.push({ reference: entry.reference, field: "cohort", path: entry.fields.cohort, completed: false });
  }
  return candidates;
}

async function publishCohortCloseout(store: Store, name: string, cohorts: { writes: Mutation[]; records: StoreRecord[]; completed: StoreRecord[] },
  notices: string[]): Promise<Extract<ArchiveResult, { status: "rejected" }> | undefined> {
  if (cohorts.writes.length === 0) return undefined;
  const valid = await revalidateLifecycleRecords(store, cohorts.records);
  if (valid.status === "refused") return reportFailure(name, valid.refusal);
  const closed = await batchLifecycleWrites(store, cohorts.writes, { verb: "archive", lifecycleAction: "archive" }, observeRecords(cohorts.completed));
  return closed.status === "refused" ? reportFailure(name, closed.refusal) : publishArchive(store, name, notices);
}

async function publishArchive(store: Store, name: string, notices: string[]): Promise<Extract<ArchiveResult, { status: "rejected" }> | undefined> {
  const synced = await store.push();
  if (synced.status === "refused") return reportFailure(name, synced.refusal);
  notices.push(...pullOutcomeNotices(synced.result.pulls));
  const held = archivePublicationHold(name, synced.result) ?? archivePublicationFailure(name, synced.result);
  if (held) return held;
  notices.push(...synced.result.states.flatMap(state => state.status === "move-unfinished" ? [renderExplained([state.condition], state.remedy)] : []));
  return undefined;
}

function archivePublicationFailure(name: string, result: PushResult): Extract<ArchiveResult, { status: "rejected" }> | undefined {
  for (const publication of result.publishes) {
    if (!archiveFamilies(publication.families)) continue;
    if (publication.status === "failed") return persistedFailure(name, publication.failure.condition, publication.failure.remedy);
    if ("condition" in publication) return persistedFailure(name, publication.condition, publication.remedy);
  }
  return undefined;
}

function archiveFamilies(families: readonly string[]): boolean { return families.includes("work-item") || families.includes("cohort"); }

function archivePublicationHold(name: string, result: PushResult): Extract<ArchiveResult, { status: "rejected" }> | undefined {
  for (const pull of result.pulls) {
    if (pull.status === "failed" && pull.role !== "read") return persistedFailure(name, pull.failure.condition, pull.failure.remedy);
  }
  const state = result.states.find((entry) => entry.status === "no-identity" && archiveFamilies(entry.families));
  if (state?.status === "no-identity") return persistedFailure(name, "Archive publication lacks its required identity.", state.remedy);
  for (const stopped of result.states) {
    if (stopped.status === "no-remote" || stopped.status === "no-identity") continue;
    if (stopped.status === "move-unfinished" && allowsArchiveCleanupAdvisory(result)) continue;
    return archiveStateFailure(name, stopped, result);
  }
  return undefined;
}

function archiveStateFailure(name: string, stopped: Exclude<SyncState, { status: "no-remote" }>,
  result: PushResult): Extract<ArchiveResult, { status: "rejected" }> {
  const question = stopped.status === "designation-needed" ? consumePull(projectPull(result)).designationNotice : undefined;
  return question ? persistedFailure(name, question) : persistedFailure(name, "condition" in stopped ? stopped.condition
    : "Archive publication requires the reported remote setting to be repaired.", stopped.remedy);
}

/** Cleanup is advisory when no remote is used or archive publication is reported separately. */
function allowsArchiveCleanupAdvisory(result: PushResult): boolean {
  return result.states.some(state => state.status === "no-remote")
    || result.publishes.some(publication => archiveFamilies(publication.families));
}

function persistedFailure(name: string, reason: string, remedy?: Remedy, refusal?: StoreRefusal): Extract<ArchiveResult, { status: "rejected" }> {
  return { status: "rejected", persisted: true, reason: `Archive persisted; completion is pending: ${reason}`,
    ...(refusal === undefined ? {} : { refusal }),
    remedy: { text: `${remedy?.text ?? "Repair the reported condition."} Retry archive to settle publication and closeout.`, argv: ["arc", "archive", name] } };
}

async function reportStoredArchive(checkoutRoot: string, store: Store, primary: StoreRecord, outcome: Extract<TransitionOutcome, { status: "ok" }>,
  cohortReferences: readonly RecordReference[], notices: readonly string[]): Promise<ArchiveResult> {
  const placement = primary.placement;
  if (placement?.kind !== "completed" || !("sequence" in placement)) throw new Error("Archive result lacks its backend-assigned sequence");
  const paths: string[] = [];
  for (const reference of cohortReferences) {
    const cohort = await store.read({ reference });
    if (cohort.status === "refused") return reportFailure(primary.reference.owner.name, cohort.refusal);
    if (cohort.result.placement?.kind === "completed") paths.push(completedCohortPath(cohort.result));
  }
  const metaPath = await workUnitMetaPath(checkoutRoot, primary);
  return { status: "archived", outcome, metaPath, destination: { quarter: placement.quarter, sequence: placement.sequence, toDir: posix.dirname(metaPath) },
    cohortSwept: paths[0] ?? null, nestedParentSwept: paths[1] ?? null, warnings: [...notices] };
}

async function prepareArchiveCohorts(store: Store, member: StoreRecord, prospective: readonly CohortHoldingCandidate[],
  quarter: Extract<WritePlacement, { kind: "completed" }>["quarter"], protectOpen = true): Promise<
  { status: "ready"; writes: Mutation[]; records: StoreRecord[]; completed: StoreRecord[]; notices: string[] } | Extract<ArchiveResult, { status: "rejected" }>> {
  const cohort = ParsedMetaRecordSchema.parse(member.fields).cohort;
  const cohortPaths = cohort === null ? [] : [cohort, ...(cohort.includes("/") ? [cohort.split("/")[0] ?? ""] : [])];
  if (cohortPaths.length === 0) return { status: "ready", writes: [], records: [], completed: [], notices: [] };
  const open = await observeOpenCohorts(store);
  if (open.status !== "known") return { status: "rejected", reason: open.status === "unavailable" ? open.condition : "Open cohort inventory is unavailable.",
    remedy: { text: "Repair the cohort inventory, then retry archive." } };
  return prepareObservedCohorts(store, cohortPaths, { member, prospective, quarter, protectOpen, open: open.value });
}

interface ArchiveCohortSnapshot {
  member: StoreRecord;
  prospective: readonly CohortHoldingCandidate[]; quarter: Extract<WritePlacement, { kind: "completed" }>["quarter"];
  protectOpen: boolean; open: readonly CohortEvidence[];
}

async function prepareObservedCohorts(store: Store, cohortPaths: readonly string[], snapshot: ArchiveCohortSnapshot): Promise<
  { status: "ready"; writes: Mutation[]; records: StoreRecord[]; completed: StoreRecord[]; notices: string[] } | Extract<ArchiveResult, { status: "rejected" }>> {
  const writes: Mutation[] = [], records: StoreRecord[] = [], notices: string[] = [];
  const completing = new Set<string>();
  for (const path of cohortPaths) {
    const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) }));
    const cohort = await store.read({ reference });
    if (cohort.status === "refused") {
      const refusal = memberCohortReadRefusal(snapshot.member, cohort.refusal);
      return { status: "rejected", reason: refusal.condition, refusal };
    }
    if (cohort.result.placement?.kind === "completed") continue;
    const held = await observeArchiveHoldings(store, cohort.result.reference, snapshot, completing);
    if (held.status === "rejected") return held;
    records.push(...held.children);
    const closing = held.holdings.length === 0;
    if (closing) completing.add(identityKey(cohort.result.reference.owner));
    if (!snapshot.protectOpen && !closing) {
      notices.push(...formerHoldingNotices(held.holdings, cohort.result));
      continue;
    }
    records.push(cohort.result);
    writes.push(recordPut(cohort.result, closing ? { placement: { kind: "completed", quarter: snapshot.quarter } } : {}));
  }
  return { status: "ready", writes, records, completed: completedCohorts(records, writes), notices };
}

/** The cohort documents a closeout completes: a conflict arriving by pull leaves a version unchanged, so each is observed. */
function completedCohorts(records: readonly StoreRecord[], writes: readonly Mutation[]): StoreRecord[] {
  return writes.flatMap(write => write.action !== "put" || write.placement?.kind !== "completed" ? []
    : records.filter(record => record.reference.kind === "cohort/document" && sameReference(record.reference, write.reference)).slice(0, 1));
}

async function observeArchiveHoldings(store: Store, cohort: RecordReference, snapshot: ArchiveCohortSnapshot, completing: ReadonlySet<string>): Promise<
  { status: "ready"; holdings: readonly CohortHolding[]; children: StoreRecord[] } | Extract<ArchiveResult, { status: "rejected" }>> {
  const parents: CohortHoldingCandidate[] = snapshot.open.flatMap(({ record, fields }) => fields.parent === null
    || completing.has(identityKey(record.reference.owner)) ? [] : [{ reference: record.reference, field: "parent", path: fields.parent, completed: false }]);
  const held = await observeCohortHoldings([...snapshot.prospective, ...parents], store, cohort);
  if (held.status !== "known") return { status: "rejected", reason: held.status === "unavailable" ? held.condition : "Cohort holding evidence is unavailable.",
    remedy: { text: "Repair the cohort holding evidence, then retry archive." } };
  const children = new Set(held.value.filter(holding => holding.candidate.field === "parent").map(holding => identityKey(holding.candidate.reference.owner)));
  return { status: "ready", holdings: held.value,
    children: snapshot.open.filter(child => children.has(identityKey(child.record.reference.owner))).map(child => child.record) };
}

function formerHoldingNotices(holdings: readonly CohortHolding[], cohort: StoreRecord): string[] {
  const slug = cohort.reference.owner.name;
  const former = holdings.filter(holding => holding.segments[holding.segment]?.name !== slug
    || holding.segments.some(segment => segment.status === "known" && segment.name !== segment.currentSlug));
  return former.length === 0 ? [] : [`Cohort ${slug} remains open. ${describeCohortHoldings(holdings, slug, cohortDocumentParent(cohort.content))}`];
}

function cohortReferencesFor(cohort: string | null): RecordReference[] {
  const paths = cohort === null ? [] : [cohort, ...(cohort.includes("/") ? [cohort.split("/")[0] ?? ""] : [])];
  return paths.map((path) => recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) })));
}

function reportFailure(slug: string, refusal: StoreRefusal): Extract<ArchiveResult, { status: "rejected" }> {
  return persistedFailure(slug, refusal.condition, refusal.remedy, refusal);
}

function completedOutcome(): Extract<TransitionOutcome, { status: "ok" }> {
  const position = { phase: "Shipped", location: "completed" } as const;
  return { status: "ok", verb: "archive", from: position, to: position, legsFired: [], sideEffectsFired: [],
    advisories: [], softFieldsWritten: [], branchFieldWritten: null, suggestion: null };
}
