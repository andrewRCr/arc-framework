/** Explicit cohort retirement over exact operational store records. */
import type { z } from "zod";
import { ArchiveQuarterSchema, type ArchiveQuarter } from "../lib/kernel/index.js";
import type { Store } from "../lib/store/contract.js";
import type { RecordReference } from "../lib/store/identity.js";
import type { StoreRefusal } from "../lib/store/refusal.js";
import type { StoreRecord } from "../lib/store/read.js";
import { recordConflictRefusal } from "../lib/store/conflict-diagnostics.js";
import { observeRecords } from "../lib/store/record-observations.js";
import { pullHistoryForRetry } from "../lib/store/pull-consumption.js";
import { reportEmptyCohorts, type EmptyCohortReport } from "../lib/store/cohort-retirement.js";
import { observeOpenHoldings, observeAllHoldings, describeCohortHoldings, describeCohortHoldingOwners, type CohortHolding } from "../lib/store/kinds/cohort/check-support.js";
import { CohortReadPlacementSchema } from "../lib/store/placement.js";
import { resolveSubjectOperand } from "../lib/store/subject-operand.js";
import { usesOffBranchState, recordPut, batchLifecycleWrites } from "../lib/store/lifecycle-write.js";
import { runDormantStoreCommand, type StoreCommandUnsupported } from "./store-command-support.js";

/** Concrete mutation intent shown before explicit confirmation. */
export interface CohortClosePlan {
  operation: "close";
  reference: RecordReference;
  placement: { kind: "completed"; quarter: ArchiveQuarter };
}
/** A removal plan identifies the exact document that would leave the store. */
export interface CohortRemovePlan { operation: "remove"; reference: RecordReference }
/** Retirement reports its actual placement or preserves a refused concrete plan. */
export type CohortCommandResult = (StoreCommandUnsupported
  | { status: "refused"; refusal: StoreRefusal; plan?: CohortClosePlan | CohortRemovePlan; persisted?: true }
  | { status: "closed"; reference: RecordReference; placement: z.infer<typeof CohortReadPlacementSchema> }
  | { status: "removed"; reference: RecordReference; placement: null })
  & { parents?: EmptyCohortReport[]; notices?: string[] };

/** Prepare a close without publication, then honor explicit confirmation in one batch. */
export async function runCohortClose(store: Store, input: { operand: string; confirmed: boolean }, clock: () => Date = () => new Date()): Promise<CohortCommandResult> {
  if (!usesOffBranchState(store)) return runDormantStoreCommand("cohort close", store);
  const selected = await prepareCloseSubject(store, input.operand);
  if (selected.status === "refused") return selected;
  const primary = selected.primary, date = clock();
  const plan: CohortClosePlan = { operation: "close", reference: primary.reference, placement: { kind: "completed",
    quarter: ArchiveQuarterSchema.parse(`${date.getFullYear()}-q${Math.floor(date.getMonth() / 3) + 1}`) } };
  if (!input.confirmed) return confirmationRequired(plan);
  const written = await batchLifecycleWrites(store, [recordPut(primary, { placement: plan.placement })],
    { verb: "cohort-close", lifecycleAction: "close" }, observeRecords([primary]));
  if (written.status === "refused") return written;
  const result = await readClosedCohort(store, plan), retirement = await reportEmptyCohorts(store, primary);
  return { ...result, parents: retirement.cohorts, notices: retirement.notices };
}

/** Remove a selected cohort document in one confirmed batch without publication. */
export async function runCohortRemove(store: Store, input: { operand: string; confirmed: boolean }): Promise<CohortCommandResult> {
  if (!usesOffBranchState(store)) return runDormantStoreCommand("cohort remove", store);
  const selected = await selectCohort(store, input.operand, "remove");
  if (selected.status === "refused") return selected;
  const first = await removeSelectedCohort(store, selected.primary, input);
  if (first.status !== "refused" || first.refusal.code !== "state-unresolvable" || first.refusal.historyRefs.length === 0) return first;
  if (!await pullHistoryForRetry(store, first.refusal.historyRefs)) return first;
  const refreshed = await store.read({ reference: selected.primary.reference });
  if (refreshed.status === "refused") return refreshed;
  return removeSelectedCohort(store, refreshed.result, input);
}

async function removeSelectedCohort(store: Store, primary: StoreRecord, input: { operand: string; confirmed: boolean }): Promise<CohortCommandResult> {
  const prepared = await prepareRemoveSubject(store, primary);
  if (prepared.status === "refused") return prepared;
  const plan: CohortRemovePlan = { operation: "remove", reference: primary.reference };
  if (!input.confirmed) return confirmationRequired(plan);
  const written = await batchLifecycleWrites(store, [{ action: "remove", reference: primary.reference, expected: primary.version }],
    { verb: "cohort-remove", lifecycleAction: "remove" }, observeRecords([primary]));
  if (written.status === "refused") return written;
  const retirement = await reportEmptyCohorts(store, primary);
  return { status: "removed", reference: primary.reference, placement: null, parents: retirement.cohorts, notices: retirement.notices };
}

/** The remedy reruns by the previewed cohort's UID, so a slug rebound before --yes cannot redirect the confirmation. */
function confirmationRequired(plan: CohortClosePlan | CohortRemovePlan): Extract<CohortCommandResult, { status: "refused" }> {
  const owner = plan.reference.owner, operand = owner.type === "person" ? owner.name : owner.uid ?? owner.name;
  return { status: "refused", plan, refusal: { code: "record-malformed", class: "recoverable", reference: plan.reference,
    rule: `cohort.${plan.operation}-confirmation`, condition: `Refusing to ${plan.operation} ${plan.reference.owner.name} without --yes.`,
    remedy: { text: `Review the ${plan.operation} plan, then repeat with --yes.`, argv: ["arc", "cohort", plan.operation, operand, "--yes"] } } };
}

async function readClosedCohort(store: Store, plan: CohortClosePlan): Promise<CohortCommandResult> {
  try {
    const closed = await store.read({ reference: plan.reference });
    if (closed.status === "refused") return { ...closed, plan, persisted: true };
    const placement = CohortReadPlacementSchema.safeParse(closed.result.placement);
    if (!placement.success) throw new Error("The store no longer reports completed cohort placement.");
    return { status: "closed", reference: closed.result.reference, placement: placement.data };
  } catch (error) {
    return { status: "refused", plan, persisted: true, refusal: { code: "record-malformed", class: "recoverable", reference: plan.reference,
      rule: "cohort.close-result", condition: error instanceof Error ? error.message : String(error),
      remedy: { text: "Repair the reported read condition, then inspect the cohort's completed state before another close." } } };
  }
}

async function selectCohort(store: Store, operand: string, operation: "close" | "remove"): Promise<
  { status: "ready"; primary: StoreRecord } | Extract<CohortCommandResult, { status: "refused" }>> {
  const selected = await resolveSubjectOperand(store, { operand,
    primaryKinds: ["work-item/meta", "work-item/record", "cohort/document"], typeRule: "cohort", resolveSlug: true });
  if (selected.status === "refused") return selected;
  if (selected.status !== "selected") return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: `cohort.${operation}-subject`,
    condition: selected.status === "unselected" ? selected.condition : "The operand did not select a cohort.",
    remedy: selected.status === "unselected" ? selected.remedy : { text: "Name a cohort by slug or full UID, then retry." } } };
  const primary = selected.primary;
  if (primary.conflicts.length > 0) return { status: "refused", refusal: recordConflictRefusal(primary, `Cohort ${primary.reference.owner.name}`, `cohort.${operation}`) };
  return { status: "ready", primary };
}

async function prepareCloseSubject(store: Store, operand: string): Promise<
  { status: "ready"; primary: StoreRecord } | Extract<CohortCommandResult, { status: "refused" }>> {
  const selected = await selectCohort(store, operand, "close");
  if (selected.status === "refused") return selected;
  const primary = selected.primary;
  if (primary.placement?.kind === "completed") return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference: primary.reference, rule: "cohort.close", condition: `Cohort ${primary.reference.owner.name} is already completed.`,
    remedy: { text: "Keep the completed cohort, or name an open cohort to close." } } };
  const held = await observeOpenHoldings(store, store, primary.reference);
  if (held.status !== "known") return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference: primary.reference, rule: "cohort.open-members", condition: held.status === "unavailable" ? held.condition : "Open holding evidence is unavailable.",
    remedy: { text: "Restore readable cohort and membership evidence, then retry close." } } };
  if (held.value.length > 0) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference: primary.reference, rule: "cohort.open-members", condition: describeCohortHoldings(held.value, primary.reference.owner.name),
    remedy: { text: closeHoldingRemedies(held.value) } } };
  return { status: "ready", primary };
}

function closeHoldingRemedies(holdings: readonly CohortHolding[]): string {
  return [...new Set(holdings.map(({ candidate }) => {
    const owner = candidate.reference.owner, operand = owner.type === "person" ? owner.name : owner.uid ?? owner.name;
    return candidate.field === "cohort" ? `For ${owner.name} (UID ${operand}), have its owner archive or abandon it, or clear its Cohort.`
      : `Settle the open members of subcohort ${owner.name} (UID ${operand}), then use arc cohort close ${operand}.`;
  }))].join(" ");
}

async function prepareRemoveSubject(store: Store, primary: StoreRecord): Promise<
  { status: "ready"; primary: StoreRecord } | Extract<CohortCommandResult, { status: "refused" }>> {
  if (primary.conflicts.length > 0) return { status: "refused", refusal: recordConflictRefusal(primary, `Cohort ${primary.reference.owner.name}`, "cohort.remove") };
  const held = await observeAllHoldings(store, primary.reference);
  if (held.status !== "known") return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
    reference: primary.reference, rule: "cohort.remove-holdings", condition: held.status === "unavailable" ? held.condition : "All-record holding evidence is unavailable.",
    remedy: { text: "Restore complete cohort and membership evidence, then retry removal." } } };
  if (held.value.length > 0) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
    rule: "cohort.remove-holdings", condition: describeCohortHoldingOwners(held.value), remedy: removalHoldingRemedy(primary) } };
  return { status: "ready", primary };
}

function removalHoldingRemedy(primary: StoreRecord): { text: string; argv?: string[] } {
  const owner = primary.reference.owner, operand = owner.type === "person" ? owner.name : owner.uid ?? owner.name;
  const retains = "Keep this document while these records name it. Removal requires their owners to clear or re-point Cohort and Parent first.";
  return primary.placement?.kind === "completed" ? { text: `${retains} This cohort is already completed; arc cohort close serves open cohorts.` }
    : { text: `${retains} Use arc cohort close ${operand} once its open members settle.`, argv: ["arc", "cohort", "close", operand] };
}
