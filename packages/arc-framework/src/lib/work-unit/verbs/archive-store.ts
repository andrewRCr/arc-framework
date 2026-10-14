/** Atomic work-unit and cohort closeout over backend-assigned archive coordinates. */
import { posix } from "node:path";
import type { Store } from "../../store/contract.js";
import { ArchiveQuarterSchema } from "../../kernel/index.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import type { RecordReference } from "../../store/identity.js";
import type { WritePlacement } from "../../store/placement.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { OwnerIdentitySchema, recordReferences } from "../../store/identity.js";
import { readWorkUnit, recordPut, workUnitMetaPath } from "../../store/lifecycle-write.js";
import { completedCohortPath } from "../../store/lifecycle-record-path.js";
import { readLifecycleView } from "../../store/lifecycle-view.js";
import { requireCompleteInventory } from "../../store/lifecycle-storage.js";
import { writeMetaSessionContext, writeMetaStateAtHandoff, writeMetaCommitAtHandoff, writeMetaSessionType } from "../../store/kinds/meta/writers.js";
import type { Mutation } from "../../store/write.js";
import type { StoreRecord } from "../../store/read.js";
import type { StoreRefusal } from "../../store/refusal.js";
import type { TransitionOutcome } from "../lifecycle-executor.js";
import { executeTransition } from "../lifecycle-executor.js";
import { isArchivalTriggeredWithDescendants } from "../lifecycle-membership.js";
import type { ArchiveContext, ArchiveParams, ArchiveResult } from "./archive.js";

/** Close session context and every newly completed cohort in the transition's single batch. */
export async function runStoreArchive(ctx: ArchiveContext & { executor: ArchiveContext["executor"] & { store: Store } }, params: ArchiveParams): Promise<ArchiveResult> {
  const { store } = ctx.executor;
  const read = await readWorkUnit(store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result, meta = ParsedMetaRecordSchema.parse(primary.fields);
  if (primary.placement?.kind === "completed" && meta.state === "Shipped" && meta.currentWorkflow === null) {
    return reportStoredArchive(store, primary, completedOutcome(), cohortReferencesFor(meta.cohort));
  }
  const date = ctx.clock(), quarter = ArchiveQuarterSchema.parse(`${date.getFullYear()}-q${Math.floor(date.getMonth() / 3) + 1}`);
  const view = await readLifecycleView(store);
  if (view.status === "refused") return { status: "rejected", reason: view.refusal.condition, refusal: view.refusal };
  try { requireCompleteInventory(store, view.result.listing); }
  catch (error) { return { status: "rejected", reason: String(error) }; }
  const prospective = new Map(view.result.index), entry = prospective.get(primary.reference.owner.name);
  if (entry === undefined) return { status: "rejected", reason: "The archive subject is absent from complete lifecycle inventory." };
  prospective.set(entry.slug, { ...entry, phase: "Shipped", location: "completed" });
  const cohorts = await prepareArchiveCohorts(store, meta.cohort, prospective, quarter);
  if (cohorts.status === "rejected") return cohorts;
  const { writes, cohortReferences } = cohorts;
  const content = writeMetaSessionType(writeMetaCommitAtHandoff(writeMetaStateAtHandoff(writeMetaSessionContext(primary.content, null), null), null), null);
  const outcome = await executeTransition(ctx.executor, { verb: "archive", slug: params.name, inputs: {
    suggestion: params.suggestion, storeTransition: { primary, content, placement: { kind: "completed", quarter }, additionalWrites: writes },
  } });
  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message,
    ...("refusal" in outcome && outcome.refusal !== undefined ? { refusal: outcome.refusal } : {}),
    ...("remedy" in outcome && outcome.remedy !== undefined ? { remedy: outcome.remedy } : {}) };
  const archived = await store.read({ reference: primary.reference });
  if (archived.status === "refused") return reportFailure(params.name, archived.refusal);
  return reportStoredArchive(store, archived.result, outcome, cohortReferences);
}

async function reportStoredArchive(store: Store, primary: StoreRecord, outcome: Extract<TransitionOutcome, { status: "ok" }>,
  cohortReferences: readonly RecordReference[]): Promise<ArchiveResult> {
  const placement = primary.placement;
  if (placement?.kind !== "completed" || !("sequence" in placement)) throw new Error("Archive result lacks its backend-assigned sequence");
  const paths: string[] = [];
  for (const reference of cohortReferences) {
    const cohort = await store.read({ reference });
    if (cohort.status === "refused") return reportFailure(primary.reference.owner.name, cohort.refusal);
    if (cohort.result.placement?.kind === "completed") paths.push(completedCohortPath(cohort.result));
  }
  const metaPath = workUnitMetaPath(primary);
  return { status: "archived", outcome, metaPath, destination: { quarter: placement.quarter, sequence: placement.sequence, toDir: posix.dirname(metaPath) },
    cohortSwept: paths[0] ?? null, nestedParentSwept: paths[1] ?? null, warnings: [] };
}

async function prepareArchiveCohorts(store: Store, cohort: string | null, prospective: LifecycleIndex,
  quarter: Extract<WritePlacement, { kind: "completed" }>["quarter"]): Promise<
  { status: "ready"; writes: Mutation[]; cohortReferences: RecordReference[] } | Extract<ArchiveResult, { status: "rejected" }>> {
  const writes: Mutation[] = [], cohortReferences: RecordReference[] = [];
  const cohortPaths = cohort === null ? [] : [cohort, ...(cohort.includes("/") ? [cohort.split("/")[0] ?? ""] : [])];
  for (const path of cohortPaths) {
    if (!isArchivalTriggeredWithDescendants(prospective, path)) continue;
    const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) }));
    const cohort = await store.read({ reference });
    if (cohort.status === "refused") return { status: "rejected", reason: cohort.refusal.condition, refusal: cohort.refusal };
    if (cohort.result.placement?.kind === "completed") continue;
    writes.push(recordPut(cohort.result, { placement: { kind: "completed", quarter } }));
    cohortReferences.push(reference);
  }
  return { status: "ready", writes, cohortReferences };
}

function cohortReferencesFor(cohort: string | null): RecordReference[] {
  const paths = cohort === null ? [] : [cohort, ...(cohort.includes("/") ? [cohort.split("/")[0] ?? ""] : [])];
  return paths.map((path) => recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) })));
}

function reportFailure(slug: string, refusal: StoreRefusal): Extract<ArchiveResult, { status: "rejected" }> {
  return { status: "rejected", persisted: true, refusal, reason: `Archive persisted; report read failed: ${refusal.condition}`,
    remedy: { text: `${refusal.remedy.text} Retry the persisted archive's report.`, argv: ["arc", "archive", slug] } };
}

function completedOutcome(): Extract<TransitionOutcome, { status: "ok" }> {
  const position = { phase: "Shipped", location: "completed" } as const;
  return { status: "ok", verb: "archive", from: position, to: position, legsFired: [], sideEffectsFired: [],
    advisories: [], softFieldsWritten: [], branchFieldWritten: null, suggestion: null };
}
