/** Member-heading authority follows every same-name work item's resolved cohort holdings. */
import type { Store } from "./contract.js";
import { sameOwner } from "./identity.js";
import type { LifecycleEntry } from "./lifecycle-index.js";
import type { ReadInput, StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import type { RecordObservation } from "./write.js";
import type { StoreView } from "./write-check.js";
import { observeRecords } from "./record-observations.js";
import { observeCohortHoldings, type CohortHoldingCandidate } from "./kinds/cohort/holdings.js";
import { rewriteCohortMemberHeading } from "./kinds/cohort/index.js";
import type { RuleObservation } from "./kinds/rule-support.js";
import type { RenameHeadingEdit } from "../work-unit/rename-report.js";

/** Whether the member heading can change, with exact repairs when its owner is ambiguous. */
export interface RenameMemberHeadingPlan {
  rewrite: boolean; edits: readonly RenameHeadingEdit[]; observations: readonly RecordObservation[];
}

/** Count current and former name holders before deciding whether a heading denotes only the subject. */
export async function planRenameMemberHeading(store: Store, input: {
  primary: StoreRecord; records: readonly StoreRecord[]; entries: readonly LifecycleEntry[]; source: string; target: string;
}): Promise<RuleObservation<RenameMemberHeadingPlan>> {
  const document = input.records.find(record => record.reference.kind === "cohort/document");
  if (document === undefined) return { status: "known", value: { rewrite: true, edits: [], observations: [] } };
  const observations: RecordObservation[] = [], candidates: CohortHoldingCandidate[] = [];
  for (const entry of input.entries) {
    const named = entry.reference.owner.name === input.source || entry.aliases?.some(alias => alias === input.source) === true;
    if (sameOwner(entry.reference.owner, input.primary.reference.owner) || !named) continue;
    const record = await store.read({ reference: entry.reference });
    if (record.status === "refused") return { status: "unavailable", condition: record.refusal.condition };
    if (record.result.version !== entry.version) return { status: "unavailable", condition: "A same-name holder changed during heading preparation." };
    observations.push(...observeRecords([record.result]));
    if (entry.fields.cohort !== null) candidates.push({ reference: entry.reference, field: "cohort", path: entry.fields.cohort,
      completed: entry.placement.kind === "completed" });
  }
  const view: StoreView = { read: query => observeHeadingRead(store, query, observations),
    list: query => store.list(query), lookup: query => store.lookup(query) };
  const held = await observeCohortHoldings(candidates, view, document.reference);
  if (held.status !== "known") return held;
  if (held.value.length === 0) return { status: "known", value: { rewrite: true, edits: [], observations } };
  const proposed = rewriteCohortMemberHeading(document.content, input.source, input.target).split("\n");
  const edits = document.content.split("\n").flatMap((line, index) => {
    const replacement = proposed[index];
    return replacement !== undefined && replacement !== line ? [{ document: document.reference, line: index + 1, replacement }] : [];
  });
  return { status: "known", value: { rewrite: false, edits, observations } };
}

async function observeHeadingRead(store: Store, input: ReadInput, observations: RecordObservation[]): Promise<StoreResult<StoreRecord>> {
  const result = await store.read(input);
  if (result.status === "ok") observations.push(...observeRecords([result.result]));
  else if (result.refusal.code === "not-found") observations.push({ reference: input.reference, expected: null });
  else if (result.refusal.code === "ambiguous-match") {
    for (const reference of result.refusal.candidates) {
      const candidate = await store.read({ reference });
      if (candidate.status === "refused") return candidate;
      observations.push(...observeRecords([candidate.result]));
    }
  }
  return result;
}
