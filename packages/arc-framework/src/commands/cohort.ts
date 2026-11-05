/** Explicit cohort retirement over exact operational store records. */
import type { z } from "zod";
import { ArchiveQuarterSchema, type ArchiveQuarter } from "../lib/kernel/index.js";
import type { Store } from "../lib/store/contract.js";
import type { RecordReference } from "../lib/store/identity.js";
import type { StoreRefusal } from "../lib/store/refusal.js";
import type { StoreRecord } from "../lib/store/read.js";
import { recordConflictRefusal } from "../lib/store/conflict-diagnostics.js";
import { observeOpenHoldings, describeCohortHoldings, type CohortHolding } from "../lib/store/kinds/cohort/check-support.js";
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
/** Close either reports the backend-assigned placement or preserves the refused plan. */
export type CohortCloseResult = StoreCommandUnsupported
  | { status: "refused"; refusal: StoreRefusal; plan?: CohortClosePlan; persisted?: true }
  | { status: "closed"; reference: RecordReference; placement: z.infer<typeof CohortReadPlacementSchema> };

/** Prepare a close without publication, then honor explicit confirmation in one batch. */
export async function runCohortClose(store: Store, input: { operand: string; confirmed: boolean }, clock: () => Date = () => new Date()): Promise<CohortCloseResult> {
  if (!usesOffBranchState(store)) return runDormantStoreCommand("cohort close", store);
  const selected = await prepareCloseSubject(store, input.operand);
  if (selected.status === "refused") return selected;
  const primary = selected.primary, date = clock();
  const plan: CohortClosePlan = { operation: "close", reference: primary.reference, placement: { kind: "completed",
    quarter: ArchiveQuarterSchema.parse(`${date.getFullYear()}-q${Math.floor(date.getMonth() / 3) + 1}`) } };
  if (!input.confirmed) return { status: "refused", plan, refusal: { code: "record-malformed", class: "recoverable", reference: primary.reference,
    rule: "cohort.close-confirmation", condition: `Refusing to close ${primary.reference.owner.name} without --yes.`,
    remedy: { text: "Review the close plan, then repeat with --yes.", argv: ["arc", "cohort", "close", input.operand, "--yes"] } } };
  const written = await batchLifecycleWrites(store, [recordPut(primary, { placement: plan.placement })], { verb: "cohort-close", lifecycleAction: "close" });
  if (written.status === "refused") return written;
  return readClosedCohort(store, plan);
}

async function readClosedCohort(store: Store, plan: CohortClosePlan): Promise<CohortCloseResult> {
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

async function prepareCloseSubject(store: Store, operand: string): Promise<
  { status: "ready"; primary: StoreRecord } | Extract<CohortCloseResult, { status: "refused" }>> {
  const selected = await resolveSubjectOperand(store, { operand,
    primaryKinds: ["work-item/meta", "work-item/record", "cohort/document"], typeRule: "cohort", resolveSlug: true });
  if (selected.status === "refused") return selected;
  if (selected.status !== "selected") return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", rule: "cohort.close-subject",
    condition: selected.status === "unselected" ? selected.condition : "The operand did not select a cohort.",
    remedy: selected.status === "unselected" ? selected.remedy : { text: "Name a cohort by slug or full UID, then retry." } } };
  const primary = selected.primary;
  if (primary.conflicts.length > 0) return { status: "refused", refusal: recordConflictRefusal(primary, `Cohort ${primary.reference.owner.name}`, "cohort.close") };
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
