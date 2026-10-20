/** Publish immutable ended-attempt facts before pruning their pending lane execution. */
import type { LocalReviewState, LaneProgressState } from "./core/operation-state-schema.js";
import { canonicalize } from "../../lib/kernel/index.js";
import { createFrontlineOutcomeRecord } from "./core/advisory-records.js";
import { projectFrontlineOutcome } from "../../lib/store/kinds/review/mapping-frontline.js";
import type { FrontlineAdmission } from "./core/frontline-admission.js";
import type { FrontlineExecutionOutcome } from "./policy/frontline-outcome.js";
import type { ReviewOutcomePort } from "./core/ports.js";
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
  if (input.attempt.frontline !== undefined) {
    const stored = await store.outcomeWriter.read(input.attempt.attemptId);
    if (stored?.value.frontline === undefined) {
      throw new Error(`Frontline result '${input.attempt.attemptId}' is not stored; replay its run before ending the attempt.`);
    }
    return;
  }
  const local = input.local;
  const value = mapReviewAttempt(input.attempt, input.lane, input.endedAt, {
    operations: new Map(local === undefined ? [] : [[local.state.operationId, local.state]]),
    discarded: new Map(), operationVersions: new Map(), frontline: new Map(),
    receipts: local?.receipt === undefined ? [] : [{ source: "local-review", receipts: [local.receipt] }],
  });
  await store.outcomeWriter.create({ ...value,
    ...(input.attempt.admittedBy === undefined ? {} : { admittedBy: input.attempt.admittedBy }) });
}

/** Verify the run's immutable result before accepting its lane completion. */
export async function confirmStoredFrontlineOutcome(outcomes: ReviewOutcomePort, admission: FrontlineAdmission,
  outcome: FrontlineExecutionOutcome): Promise<void> {
  const stored = await outcomes.read(admission.operationId);
  if (stored?.value.frontline === undefined) {
    throw new Error(`Frontline result '${admission.operationId}' is not stored; replay its run before ending the attempt.`);
  }
  const binding = stored.value.frontline;
  const record = createFrontlineOutcomeRecord({ schemaVersion: 1, semanticsVersion: "review-advisory/v1",
    repositoryId: admission.target.repositoryId, operationId: admission.operationId,
    sourceIdentity: outcome.source.sourceId, executableIdentity: binding.executableIdentity, outcome,
    ...(binding.responseBinding === undefined ? {} : { responseBinding: binding.responseBinding }) });
  const projected = projectFrontlineOutcome(admission, record, stored.value.endedAt);
  if (canonicalize(projected) !== canonicalize(stored.value)) {
    throw new Error(`Frontline result '${admission.operationId}' does not match its admitted completion.`);
  }
}
