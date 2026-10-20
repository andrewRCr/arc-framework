/** Publish immutable ended-attempt facts before pruning their pending lane execution. */
import type { LocalReviewState, LaneProgressState } from "./core/operation-state-schema.js";
import type { ReviewReceiptV2 } from "./core/gate-contract-v2-schema.js";
import type { ReviewLaneTransitionStore } from "./core/ports.js";
import { mapReviewAttempt } from "../../lib/store/kinds/review/mapping-outcomes.js";

/** Full local admission and optional terminal receipt retained until outcome publication. */
export interface LocalLaneOutcomeSource { state: LocalReviewState; receipt?: ReviewReceiptV2 }

/** Write an ended attempt through the invocation's selected result writer before execution cleanup. */
export async function publishEndedLaneOutcome(store: ReviewLaneTransitionStore, input: {
  attempt: LaneProgressState["attempts"][number]; lane: LaneProgressState;
  endedAt: string; local?: LocalLaneOutcomeSource;
}): Promise<void> {
  if (store.outcomeWriter === undefined || input.attempt.outcome === "pending") return;
  const local = input.local;
  const value = mapReviewAttempt(input.attempt, input.lane, input.endedAt, {
    operations: new Map(local === undefined ? [] : [[local.state.operationId, local.state]]),
    discarded: new Map(), operationVersions: new Map(), frontline: new Map(),
    receipts: local?.receipt === undefined ? [] : [{ source: "local-review", receipts: [local.receipt] }],
  });
  await store.outcomeWriter.create({ ...value,
    ...(input.attempt.admittedBy === undefined ? {} : { admittedBy: input.attempt.admittedBy }) });
}
