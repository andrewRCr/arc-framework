/** Member-heading authority follows every same-name work item's resolved cohort holdings. */
import type { Store } from "./contract.js";
import { sameOwner } from "./identity.js";
import type { LifecycleEntry } from "./lifecycle-index.js";
import type { StoreRecord } from "./read.js";
import { observeCohortHoldings, type CohortHoldingCandidate } from "./kinds/cohort/holdings.js";
import { rewriteCohortMemberHeading } from "./kinds/cohort/index.js";
import type { RuleObservation } from "./kinds/rule-support.js";
import type { RenameHeadingEdit } from "../work-unit/rename-report.js";

/** Whether the member heading can change, with exact repairs when its owner is ambiguous. */
export interface RenameMemberHeadingPlan { rewrite: boolean; edits: readonly RenameHeadingEdit[] }

/** Count current and former name holders before deciding whether a heading denotes only the subject. */
export async function planRenameMemberHeading(store: Store, input: {
  primary: StoreRecord; records: readonly StoreRecord[]; entries: readonly LifecycleEntry[]; source: string; target: string;
}): Promise<RuleObservation<RenameMemberHeadingPlan>> {
  const document = input.records.find(record => record.reference.kind === "cohort/document");
  if (document === undefined) return { status: "known", value: { rewrite: true, edits: [] } };
  const candidates: CohortHoldingCandidate[] = input.entries.flatMap(entry => {
    const named = entry.reference.owner.name === input.source || entry.aliases?.some(alias => alias === input.source) === true;
    return !sameOwner(entry.reference.owner, input.primary.reference.owner) && named && entry.fields.cohort !== null
      ? [{ reference: entry.reference, field: "cohort", path: entry.fields.cohort, completed: entry.placement.kind === "completed" }] : [];
  });
  const held = await observeCohortHoldings(candidates, store, document.reference);
  if (held.status !== "known") return held;
  if (held.value.length === 0) return { status: "known", value: { rewrite: true, edits: [] } };
  const proposed = rewriteCohortMemberHeading(document.content, input.source, input.target).split("\n");
  const edits = document.content.split("\n").flatMap((line, index) => {
    const replacement = proposed[index];
    return replacement !== undefined && replacement !== line ? [{ document: document.reference, line: index + 1, replacement }] : [];
  });
  return { status: "known", value: { rewrite: false, edits } };
}
