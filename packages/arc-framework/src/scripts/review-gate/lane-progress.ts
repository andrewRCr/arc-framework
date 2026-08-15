/** Durable per-attempt lane progress at the fidelity the review-policy driver reads. */

import { createHash } from "node:crypto";

import {
  LaneProgressStateSchema,
  type LaneProgressState,
} from "./core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import type { HostedAwaitResult } from "./hosted/await.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LaneAttemptOutcome = LaneAttempt["outcome"];

/** Hosted await states that conclude an attempt, keyed to the driver's outcome vocabulary. */
const HOSTED_AWAIT_OUTCOMES = {
  clean: "clean",
  findings: "findings",
  "rate-limited": "rate-limited",
  "transient-unavailable": "transient-unavailable",
  "stale-target": "stale-target",
  "source-unavailable": "source-unbound",
  "malformed-output": "malformed",
  "terminal-failure": "terminal-failure",
} as const satisfies Record<string, LaneAttemptOutcome>;

/**
 * Map one hosted await state onto the driver's attempt vocabulary.
 *
 * @param state - The `state` field of a hosted await result.
 * @returns The driver-grade outcome, or `null` when the state concluded no attempt.
 */
export function hostedAwaitLaneOutcome(state: string): LaneAttemptOutcome | null {
  return state in HOSTED_AWAIT_OUTCOMES
    ? HOSTED_AWAIT_OUTCOMES[state as keyof typeof HOSTED_AWAIT_OUTCOMES]
    : null;
}

/**
 * Resolve the stable operation identity holding one lane's progress against one exact head.
 *
 * @param input - The lane and the exact target it is reviewing.
 * @returns The operation identifier for that lane and target.
 */
export function laneProgressOperationId(input: {
  lane: LaneProgressState["lane"];
  repositoryId: string;
  headSha: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.lane}\0${input.repositoryId}\0${input.headSha}`)
    .digest("hex");
  return `lane-progress/${digest}`;
}

/**
 * Append one concluded attempt to its lane's durable progress.
 *
 * `consumedPass` is the caller's, not this function's: the review-policy driver reports whether a
 * resolution consumed a pass, so pass accounting follows that same distinction rather than being
 * inferred from the outcome here.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The lane, its exact target, the concluded attempt, and whether it consumed a pass.
 * @returns The published lane-progress record.
 */
export async function recordLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    changeRequestId: string | null;
    headSha: string;
    sourceId: string;
    outcome: LaneAttemptOutcome;
    consumedPass: boolean;
    chunkSeriesComplete?: boolean;
    now: string;
  },
): Promise<LaneProgressState> {
  const operationId = laneProgressOperationId(input);
  const { version, state } = await store.readOperation(operationId);
  const existing = state !== null && state.kind === "lane-progress" ? state : null;
  const attempt: LaneAttempt = {
    sourceId: input.sourceId,
    outcome: input.outcome,
    ...(input.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: input.chunkSeriesComplete }),
  };
  const next = LaneProgressStateSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-operation/v1",
    operationId,
    updatedAt: input.now,
    kind: "lane-progress",
    lane: input.lane,
    repositoryId: input.repositoryId,
    changeRequestId: input.changeRequestId,
    headSha: input.headSha,
    completedPasses: (existing?.completedPasses ?? 0) + (input.consumedPass ? 1 : 0),
    attempts: [...existing?.attempts ?? [], attempt],
  });
  await store.publishOperation(next, version);
  return next;
}

/**
 * Record one concluded hosted await against its standard-lane progress.
 *
 * A verdict-bearing outcome consumes a pass; an unavailable or failed attempt is recorded without
 * consuming one, matching the review-policy driver's own `consumedPass` distinction.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The hosted await result and the timestamp to record it at.
 * @returns The published record, or `null` when the call yielded without concluding an attempt.
 */
export async function recordHostedAwaitAttempt(
  store: ReviewOperationStateStore,
  input: { result: HostedAwaitResult; now: string },
): Promise<LaneProgressState | null> {
  const outcome = hostedAwaitLaneOutcome(input.result.state);
  if (outcome === null) return null;
  const { handle } = input.result;
  return await recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: handle.target.repository,
    changeRequestId: `pull/${handle.target.pullRequest}`,
    headSha: handle.target.headSha,
    sourceId: handle.provider,
    outcome,
    consumedPass: outcome === "clean" || outcome === "findings",
    now: input.now,
  });
}
