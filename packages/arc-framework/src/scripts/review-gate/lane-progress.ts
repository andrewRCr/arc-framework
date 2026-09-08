/** Durable per-attempt lane progress at the fidelity the review-policy driver reads. */

import { createHash } from "node:crypto";

import { canonicalDigest, canonicalize } from "../../lib/kernel/index.js";
import {
  LaneProgressStateSchema,
  type LaneProgressState,
} from "./core/operation-state-schema.js";
import type { LaneSubjectLineage } from "./core/lane-admission.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import {
  isReviewVersionConflict,
  REVIEW_VERSION_RETRY_ATTEMPTS,
} from "./core/version-conflict.js";
import type { HostedAwaitResult } from "./hosted/await.js";
import type {
  HostedRequestEnvelope,
  HostedRequestHandle,
  HostedRequestResult,
} from "./hosted/request.js";
import type { FrontlineExecutionOutcome } from "./policy/frontline-outcome.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LaneAttemptOutcome = LaneAttempt["outcome"];

function pendingAttemptCanAdvance(pending: LaneAttempt, next: LaneAttempt): boolean {
  const pendingHosted = pending.hosted;
  const nextHosted = next.hosted;
  if (pending.outcome !== "pending" || next.outcome === "pending") return false;
  if (pending.local !== undefined || next.local !== undefined) {
    return pending.local !== undefined
      && next.local !== undefined
      && canonicalize({
        attemptId: pending.attemptId,
        logicalPass: pending.logicalPass,
        retryGeneration: pending.retryGeneration,
        changeRequestId: pending.changeRequestId,
        headSha: pending.headSha,
        sourceId: pending.sourceId,
        local: pending.local,
      }) === canonicalize({
        attemptId: next.attemptId,
        logicalPass: next.logicalPass,
        retryGeneration: next.retryGeneration,
        changeRequestId: next.changeRequestId,
        headSha: next.headSha,
        sourceId: next.sourceId,
        local: next.local,
      });
  }
  if (pendingHosted?.handle === undefined || nextHosted?.handle === undefined
    || pendingHosted.findings.length !== 0 || pendingHosted.dispositionSetId !== null
    || pendingHosted.settledFindingIds.length !== 0) return false;
  return canonicalize({
    attemptId: pending.attemptId,
    logicalPass: pending.logicalPass,
    retryGeneration: pending.retryGeneration,
    changeRequestId: pending.changeRequestId,
    headSha: pending.headSha,
    sourceId: pending.sourceId,
    ...(pending.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: pending.chunkSeriesComplete }),
    handle: pendingHosted.handle,
    target: pendingHosted.target,
    requestedCoverage: pendingHosted.requestedCoverage,
    effectiveCoverage: pendingHosted.effectiveCoverage,
    ...(pendingHosted.vehicle === undefined ? {} : { vehicle: pendingHosted.vehicle }),
    reviewTarget: pendingHosted.reviewTarget,
    requirement: pendingHosted.requirement,
    actorIdentity: pendingHosted.actorIdentity,
  }) === canonicalize({
    attemptId: next.attemptId,
    logicalPass: next.logicalPass,
    retryGeneration: next.retryGeneration,
    changeRequestId: next.changeRequestId,
    headSha: next.headSha,
    sourceId: next.sourceId,
    ...(next.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: next.chunkSeriesComplete }),
    handle: nextHosted.handle,
    target: nextHosted.target,
    requestedCoverage: nextHosted.requestedCoverage,
    effectiveCoverage: nextHosted.effectiveCoverage,
    ...(nextHosted.vehicle === undefined ? {} : { vehicle: nextHosted.vehicle }),
    reviewTarget: nextHosted.reviewTarget,
    requirement: nextHosted.requirement,
    actorIdentity: nextHosted.actorIdentity,
  });
}

/** Resolve the stable identity of one hosted request attempt. */
export function hostedLaneAttemptId(handle: HostedRequestHandle): string {
  return `hosted/${canonicalDigest(handle).slice("sha256:".length)}`;
}

/** Resolve the stable identity of one safe request-time unavailability attempt. */
function hostedRequestUnavailableAttemptId(input: {
  request: HostedRequestEnvelope;
  state: "rate-limited" | "transient-unavailable";
}): string {
  const digest = canonicalDigest({
    domain: "arc.review.hosted-request-unavailable/v1",
    request: input.request,
    state: input.state,
  });
  return `hosted-request/${digest.slice("sha256:".length)}`;
}

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
  lineage?: LaneSubjectLineage;
}): string {
  const subject = input.lineage ?? {
    kind: "head-bound" as const,
    vehicleKind: "review-target",
    vehicleIdentity: `${input.repositoryId}/${input.headSha}`,
    headSha: input.headSha,
  };
  const digest = createHash("sha256")
    .update(canonicalize({
      domain: "arc.review.lane-progress-owner/v1",
      lane: input.lane,
      repositoryId: input.repositoryId,
      subject,
    }))
    .digest("hex");
  return `lane-progress/${digest}`;
}

/**
 * Record one attempt state in its lane's durable progress.
 *
 * `consumedPass` is the caller's, not this function's: the review-policy driver reports whether a
 * resolution consumed a pass, so pass accounting follows that same distinction rather than being
 * inferred from the outcome here.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The lane, its exact target, the attempt state, and whether it consumed a pass.
 * @returns The published lane-progress record.
 */
export async function recordLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    changeRequestId: string | null;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    sourceId: string;
    outcome: LaneAttemptOutcome;
    consumedPass: boolean;
    chunkSeriesComplete?: boolean;
    hosted?: LaneAttempt["hosted"];
    local?: LaneAttempt["local"];
    now: string;
    advancePendingAttempt?: boolean;
    logicalPass?: number;
    retryGeneration?: number;
  },
): Promise<LaneProgressState> {
  const lineage = input.lineage ?? {
    kind: "head-bound" as const,
    vehicleKind: "review-target",
    vehicleIdentity: `${input.repositoryId}/${input.headSha}`,
    headSha: input.headSha,
  };
  const operationId = laneProgressOperationId({ ...input, lineage });
  for (let writeAttempt = 0; writeAttempt < REVIEW_VERSION_RETRY_ATTEMPTS; writeAttempt += 1) {
    const { version, state } = await store.readOperation(operationId);
    const existing = state !== null && state.kind === "lane-progress" ? state : null;
    const replay = existing?.attempts.find((candidate) => candidate.attemptId === input.attemptId);
    const attempt: LaneAttempt = {
      attemptId: input.attemptId,
      logicalPass: input.logicalPass ?? replay?.logicalPass ?? (existing?.completedPasses ?? 0) + 1,
      retryGeneration: input.retryGeneration ?? replay?.retryGeneration ?? 0,
      changeRequestId: input.changeRequestId,
      headSha: input.headSha,
      terminalProducer: input.consumedPass,
      sourceId: input.sourceId,
      outcome: input.outcome,
      ...(input.chunkSeriesComplete === undefined ? {} : { chunkSeriesComplete: input.chunkSeriesComplete }),
      ...(input.hosted === undefined ? {} : { hosted: input.hosted }),
      ...(input.local === undefined ? {} : { local: input.local }),
    };
    if (replay !== undefined && canonicalize(replay) === canonicalize(attempt)) {
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      return LaneProgressStateSchema.parse(existing);
    }
    let next: LaneProgressState;
    if (replay !== undefined) {
      if (input.advancePendingAttempt !== true || !pendingAttemptCanAdvance(replay, attempt)) {
        throw new Error("conflicting lane-attempt replay");
      }
      if (existing === null) throw new Error("lane-attempt replay has no lane progress record");
      const attempts = existing.attempts.map((candidate) => candidate.attemptId === input.attemptId
        ? attempt
        : candidate);
      const completedPasses = new Set(attempts
        .filter(({ terminalProducer }) => terminalProducer)
        .map(({ logicalPass }) => logicalPass)).size;
      next = LaneProgressStateSchema.parse({
        ...existing,
        updatedAt: input.now,
        completedPasses,
        attempts,
      });
    } else {
      const attempts = [...existing?.attempts ?? [], attempt];
      const completedPasses = new Set(attempts
        .filter(({ terminalProducer }) => terminalProducer)
        .map(({ logicalPass }) => logicalPass)).size;
      next = LaneProgressStateSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "review-operation/v1",
        operationId,
        updatedAt: input.now,
        kind: "lane-progress",
        lane: input.lane,
        repositoryId: input.repositoryId,
        lineage,
        completedPasses,
        attempts,
      });
    }
    try {
      await store.publishOperation(next, version);
      return next;
    } catch (error) {
      if (!isReviewVersionConflict(error)) throw error;
    }
  }
  throw new Error("lane progress exceeded version-conflict retry attempts");
}

/** Persist one successful hosted request before any await call can be lost to restart. */
export async function recordHostedPendingRequest(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    handle: HostedRequestHandle;
    reviewTarget: NonNullable<LaneAttempt["hosted"]>["reviewTarget"];
    requirement: NonNullable<LaneAttempt["hosted"]>["requirement"];
    actorIdentity: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const { handle } = input;
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: input.repositoryId,
    changeRequestId: `pull/${handle.target.pullRequest}`,
    headSha: handle.target.headSha,
    attemptId: hostedLaneAttemptId(handle),
    sourceId: handle.provider,
    outcome: "pending",
    consumedPass: false,
    hosted: {
      handle,
      target: handle.target,
      requestedCoverage: handle.requestedCoverage,
      effectiveCoverage: handle.effectiveCoverage,
      ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
      reviewTarget: input.reviewTarget,
      requirement: input.requirement,
      actorIdentity: input.actorIdentity,
      findings: [],
      dispositionSetId: null,
      settledFindingIds: [],
    },
    now: input.now,
  });
}

/**
 * Record one hosted await against its standard-lane progress.
 *
 * Pending results preserve the request handle without consuming a pass. A verdict-bearing outcome
 * advances that same attempt and consumes a pass; unavailable or failed attempts advance it without
 * consuming one, matching the review-policy driver's own `consumedPass` distinction.
 *
 * `repositoryId` is the store's own repository identity, not the host's `owner/repo` slug — every
 * sibling operation record keys on that identity, and both lanes must key alike for one reader to
 * find either. The host coordinates travel on `changeRequestId` and the caller's policy target.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The repository identity, the hosted await result, and the timestamp.
 * @returns The published lane-progress record.
 */
export async function recordHostedAwaitAttempt(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    result: HostedAwaitResult;
    reviewTarget: NonNullable<LaneAttempt["hosted"]>["reviewTarget"];
    requirement: NonNullable<LaneAttempt["hosted"]>["requirement"];
    actorIdentity: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const outcome = hostedAwaitLaneOutcome(input.result.state);
  const { handle } = input.result;
  if (outcome === null) {
    return recordHostedPendingRequest(store, {
      repositoryId: input.repositoryId,
      handle,
      reviewTarget: input.reviewTarget,
      requirement: input.requirement,
      actorIdentity: input.actorIdentity,
      now: input.now,
    });
  }
  return await recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: input.repositoryId,
    changeRequestId: `pull/${handle.target.pullRequest}`,
    headSha: handle.target.headSha,
    attemptId: hostedLaneAttemptId(handle),
    sourceId: handle.provider,
    outcome,
    consumedPass: handle.effectiveCoverage === "complete"
      && (outcome === "clean" || outcome === "findings"),
    advancePendingAttempt: true,
    hosted: {
      handle,
      target: handle.target,
      requestedCoverage: handle.requestedCoverage,
      effectiveCoverage: handle.effectiveCoverage,
      ...(handle.vehicle?.kind === "delivery-member" ? { vehicle: handle.vehicle } : {}),
      reviewTarget: input.reviewTarget,
      requirement: input.requirement,
      actorIdentity: input.actorIdentity,
      findings: input.result.state === "findings" ? input.result.findings : [],
      dispositionSetId: null,
      settledFindingIds: [],
    },
    now: input.now,
  });
}

/** Persist one admitted local producer before its executable inputs leave the runtime. */
export async function recordLocalPendingAttempt(
  store: ReviewOperationStateStore,
  input: { state: Extract<import("./core/operation-state-schema.js").ReviewOperationState, { kind: "local-review" }>; now: string },
): Promise<LaneProgressState> {
  const { state } = input;
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: state.repositoryId,
    changeRequestId: null,
    headSha: state.target.headSha,
    lineage: state.lineage,
    logicalPass: state.logicalPass,
    retryGeneration: state.retryGeneration,
    attemptId: state.operationId,
    sourceId: state.laneSourceId,
    outcome: "pending",
    consumedPass: false,
    local: {
      operationId: state.operationId,
      requestId: state.requestId,
      vehicle: state.vehicle,
      target: state.target,
      ...(state.deliveryAdmission === undefined ? {} : { deliveryAdmission: state.deliveryAdmission }),
    },
    now: input.now,
  });
}

/** Record safe unavailability returned before a hosted request produced a handle. */
export async function recordHostedRequestUnavailableAttempt(
  store: ReviewOperationStateStore,
  input: {
    repositoryId: string;
    request: HostedRequestEnvelope;
    result: Extract<HostedRequestResult, { nextAction: "try-next-source" }>;
    reviewTarget: NonNullable<LaneAttempt["hosted"]>["reviewTarget"];
    requirement: NonNullable<LaneAttempt["hosted"]>["requirement"];
    actorIdentity: string;
    now: string;
  },
): Promise<LaneProgressState> {
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: input.repositoryId,
    changeRequestId: `pull/${input.request.target.pullRequest}`,
    headSha: input.request.target.headSha,
    attemptId: hostedRequestUnavailableAttemptId({
      request: input.request,
      state: input.result.state,
    }),
    sourceId: input.request.provider,
    outcome: input.result.state,
    consumedPass: false,
    hosted: {
      target: input.request.target,
      requestedCoverage: input.request.coverage,
      effectiveCoverage: null,
      ...(input.request.vehicle?.kind === "delivery-member" ? { vehicle: input.request.vehicle } : {}),
      reviewTarget: input.reviewTarget,
      requirement: input.requirement,
      actorIdentity: input.actorIdentity,
      findings: [],
      dispositionSetId: null,
      settledFindingIds: [],
    },
    now: input.now,
  });
}

/** Bind approval to one hosted findings attempt and settle findings with no host-side action. */
export async function bindHostedAttemptDisposition(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingIds: readonly string[];
    noHostSettlementFindingIds: readonly string[];
    now: string;
  },
): Promise<LaneProgressState> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt?.outcome !== "findings" || attempt.hosted === undefined) {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const recordedFindingIds = attempt.hosted.findings.map(({ findingId }) => findingId).sort();
  if (canonicalize([...input.findingIds].sort()) !== canonicalize(recordedFindingIds)) {
    throw new Error("approved dispositions do not cover the hosted finding set");
  }
  if (attempt.hosted.dispositionSetId !== null
    && attempt.hosted.dispositionSetId !== input.dispositionSetId) {
    throw new Error("hosted lane attempt already binds a different disposition set");
  }
  const settledFindingIds = [...new Set([
    ...attempt.hosted.settledFindingIds,
    ...input.noHostSettlementFindingIds,
  ])].sort();
  if (settledFindingIds.some((findingId) => !recordedFindingIds.includes(findingId))) {
    throw new Error("hosted settlement references an unknown finding");
  }
  const complete = settledFindingIds.length === recordedFindingIds.length;
  const attempts = [...state.attempts];
  attempts[index] = {
    ...attempt,
    outcome: complete ? "settled-findings" : "findings",
    hosted: {
      ...attempt.hosted,
      dispositionSetId: input.dispositionSetId,
      settledFindingIds,
    },
  };
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

/** Record successful host-side settlement for one approved finding and close the attempt when complete. */
export async function settleHostedAttemptFinding(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingId: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt === undefined
    || attempt.hosted === undefined
    || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")
    || attempt.hosted.dispositionSetId !== input.dispositionSetId
    || !attempt.hosted.findings.some(({ findingId }) => findingId === input.findingId)) {
    throw new Error("hosted finding settlement does not match the approved lane attempt");
  }
  if (attempt.hosted.settledFindingIds.includes(input.findingId)) return state;
  const settledFindingIds = [...attempt.hosted.settledFindingIds, input.findingId].sort();
  const attempts = [...state.attempts];
  attempts[index] = {
    ...attempt,
    outcome: settledFindingIds.length === attempt.hosted.findings.length ? "settled-findings" : "findings",
    hosted: { ...attempt.hosted, settledFindingIds },
  };
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

/**
 * Frontline reason classes keyed to the driver's outcome vocabulary.
 *
 * The four retryable carrier failures map onto `transient-unavailable` because that is the lane's
 * own classification of them — the frontline run command routes exactly these to a retry action —
 * and it is the only value in the driver's vocabulary carrying that meaning.
 */
const FRONTLINE_REASON_OUTCOMES = {
  "rate-limited": "rate-limited",
  "transient-unavailable": "transient-unavailable",
  "source-unbound": "source-unbound",
  "capability-unsupported": "capability-unsupported",
  "execution-timeout": "timed-out",
  "head-mismatch": "stale-target",
  "target-mismatch": "stale-target",
  "invalid-output": "malformed",
  "authorization-rejected": "terminal-failure",
  "transient-transport": "transient-unavailable",
  "process-failure": "transient-unavailable",
  "signal-termination": "transient-unavailable",
  "unexpected-adapter-failure": "transient-unavailable",
} as const satisfies Record<string, LaneAttemptOutcome>;

/**
 * Map one frontline execution outcome onto the driver's attempt vocabulary.
 *
 * @param outcome - The outcome discriminator.
 * @param reasonClass - The outcome's reason class, or `null` for a verdict-bearing outcome.
 * @returns The driver-grade outcome, or `null` when the outcome concluded no attempt.
 */
export function frontlineLaneOutcome(outcome: string, reasonClass: string | null): LaneAttemptOutcome | null {
  if (outcome === "clean" || outcome === "findings") return outcome;
  if (reasonClass !== null && reasonClass in FRONTLINE_REASON_OUTCOMES) {
    return FRONTLINE_REASON_OUTCOMES[reasonClass as keyof typeof FRONTLINE_REASON_OUTCOMES];
  }
  return null;
}

/**
 * Record one concluded frontline execution against its lane progress.
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The frontline execution outcome and the timestamp to record it at.
 * @returns The published record, or `null` when the outcome concluded no attempt.
 */
export async function recordFrontlineAttempt(
  store: ReviewOperationStateStore,
  input: { attemptId: string; outcome: FrontlineExecutionOutcome; now: string },
): Promise<LaneProgressState | null> {
  const { outcome } = input;
  const laneOutcome = frontlineLaneOutcome(outcome.outcome, outcome.reason?.class ?? null);
  if (laneOutcome === null) return null;
  return await recordLaneAttempt(store, {
    lane: "frontline",
    repositoryId: outcome.target.repositoryId,
    changeRequestId: null,
    headSha: outcome.target.headSha,
    attemptId: input.attemptId,
    sourceId: outcome.source.sourceId,
    outcome: laneOutcome,
    consumedPass: laneOutcome === "clean" || laneOutcome === "findings",
    chunkSeriesComplete: laneOutcome === "clean" || laneOutcome === "findings",
    now: input.now,
  });
}

/** Mark one persisted findings verdict settled after its approved record is durable. */
export async function settleLaneAttempt(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
    attemptId: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const operationId = laneProgressOperationId(input);
  const { version, state } = await store.readOperation(operationId);
  if (state === null
    || state.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId) {
    throw new Error("lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex((attempt) => attempt.attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (attempt === undefined) throw new Error("lane findings attempt is unavailable");
  if (attempt.headSha !== input.headSha) throw new Error("lane findings attempt is unavailable");
  if (attempt.outcome === "settled-findings") return state;
  if (attempt.outcome !== "findings") throw new Error("lane attempt does not carry findings");
  const attempts = [...state.attempts];
  attempts[index] = { ...attempt, outcome: "settled-findings" };
  const next = LaneProgressStateSchema.parse({
    ...state,
    updatedAt: input.now,
    attempts,
  });
  await store.publishOperation(next, version);
  return next;
}

type LanePolicyLocalBinding = Omit<
  NonNullable<LaneAttempt["local"]>,
  "operationId" | "requestId"
> & Partial<Pick<NonNullable<LaneAttempt["local"]>, "operationId" | "requestId">>;

export type LanePolicyAttempt = Pick<
  LaneAttempt,
  "attemptId" | "sourceId" | "outcome" | "chunkSeriesComplete"
> & {
  hosted?: LaneAttempt["hosted"];
  local?: LanePolicyLocalBinding;
};

export type LaneProgressProjection =
  | { status: "unrecorded" }
  | {
    status: "recorded";
    completedPasses: number;
    attempts: readonly LanePolicyAttempt[];
  };

/** Read one complete lineage owner without applying an exact-head projection. */
export async function readLaneProgressOwner(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage: LaneSubjectLineage;
  },
): Promise<LaneProgressState | null> {
  const { state } = await store.readOperation(laneProgressOperationId(input));
  if (state === null
    || state.kind !== "lane-progress"
    || state.lane !== input.lane
    || state.repositoryId !== input.repositoryId
    || canonicalize(state.lineage) !== canonicalize(input.lineage)) return null;
  return state;
}

/**
 * Read one lane's recorded progress for an exact head.
 *
 * An unrecorded lane is reported as such rather than as zero attempts: the two are different facts,
 * and a caller composing a policy request must not read "nothing was kept" as "nothing happened".
 *
 * @param store - Versioned operation-state storage boundary.
 * @param input - The lane and the exact target to read progress for.
 * @returns The recorded pass count and ordered attempts, or an unrecorded result.
 */
export async function readLaneProgress(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineage?: LaneSubjectLineage;
  },
): Promise<LaneProgressProjection> {
  const { state } = await store.readOperation(laneProgressOperationId(input));
  if (state === null || state.kind !== "lane-progress") return { status: "unrecorded" };
  if (state.lane !== input.lane
    || state.repositoryId !== input.repositoryId) {
    return { status: "unrecorded" };
  }
  return {
    status: "recorded",
    completedPasses: state.completedPasses,
    attempts: state.attempts.filter((attempt) => attempt.headSha === input.headSha),
  };
}

/** Read current-head attempts while carrying consumed-pass counts across one authorized lineage. */
export async function readLaneProgressAcrossLineage(
  store: ReviewOperationStateStore,
  input: {
    lane: LaneProgressState["lane"];
    repositoryId: string;
    headSha: string;
    lineageHeadShas: readonly string[];
    lineage?: LaneSubjectLineage;
  },
): Promise<LaneProgressProjection> {
  const owner = input.lineage === undefined
    ? null
    : await readLaneProgressOwner(store, {
      lane: input.lane,
      repositoryId: input.repositoryId,
      headSha: input.headSha,
      lineage: input.lineage,
    });
  const heads = [...new Set([...input.lineageHeadShas, input.headSha])];
  const records = await Promise.all(heads.map(async (headSha) => ({
    headSha,
    progress: await readLaneProgress(store, {
      lane: input.lane,
      repositoryId: input.repositoryId,
      headSha,
    }),
  })));
  const current = records.find(({ headSha }) => headSha === input.headSha)?.progress;
  const completedPasses = (owner?.completedPasses ?? 0) + records.reduce((total, { progress }) => (
    total + (progress.status === "recorded" ? progress.completedPasses : 0)
  ), 0);
  const ownerAttempts = owner?.attempts.filter((attempt) => attempt.headSha === input.headSha) ?? [];
  if (completedPasses === 0 && current?.status !== "recorded" && owner === null) {
    return { status: "unrecorded" };
  }
  return {
    status: "recorded",
    completedPasses,
    attempts: [
      ...ownerAttempts,
      ...(current?.status === "recorded" ? current.attempts : []),
    ],
  };
}
