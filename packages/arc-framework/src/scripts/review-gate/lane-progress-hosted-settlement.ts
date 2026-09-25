/** Hosted disposition and finding settlement transitions. */

import { canonicalize } from "../../lib/kernel/index.js";
import { LaneProgressStateSchema, type LaneProgressState } from "./core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "./core/ports.js";
import type { HostedAdmission, HostedRequestResult, HostedTarget } from "./hosted/request.js";
import { completeHostedAttemptIfReady, laneProgressOperationId, recordLaneAttempt } from "./lane-progress.js";

type LaneAttempt = LaneProgressState["attempts"][number];

function requestConclusionMatchesAdmission(
  admission: HostedAdmission,
  result: Extract<HostedRequestResult, { state:
    | "rate-limited" | "transient-unavailable" | "ambiguous-delivery" | "terminal-failure" }>,
): boolean {
  return result.provider === admission.sourceId
    && result.requestedCoverage === admission.requestedCoverage
    && result.attemptedProviders.length === 1
    && result.attemptedProviders[0] === admission.sourceId;
}

export async function recordHostedRequestConclusion(
  store: ReviewOperationStateStore,
  input: {
    admission: HostedAdmission;
    result: Extract<HostedRequestResult, { state:
      | "rate-limited"
      | "transient-unavailable"
      | "ambiguous-delivery"
      | "terminal-failure" }>;
    now: string;
  },
): Promise<LaneProgressState> {
  const { admission, result } = input;
  if (!requestConclusionMatchesAdmission(admission, result)) {
    throw new Error("hosted request conclusion does not match its admission");
  }
  const operationId = laneProgressOperationId({
    lane: "standard",
    repositoryId: admission.repositoryId,
    headSha: admission.target.headSha,
    lineage: admission.lineage,
  });
  const admittedState = await store.readOperation(operationId);
  const admitted = admittedState.state?.kind === "lane-progress"
    ? admittedState.state.attempts.find((attempt) => attempt.attemptId === admission.admissionId)
    : undefined;
  if (admitted?.outcome !== "pending"
    || admitted.hosted?.handle !== undefined
    || canonicalize(admitted.hosted?.admission ?? null) !== canonicalize(admission)) {
    throw new Error("hosted request conclusion requires its unacknowledged pending admission");
  }
  return recordLaneAttempt(store, {
    lane: "standard",
    repositoryId: admission.repositoryId,
    changeRequestId: `pull/${admission.target.pullRequest}`,
    headSha: admission.target.headSha,
    lineage: admission.lineage,
    logicalPass: admission.logicalPass,
    attemptId: admission.admissionId,
    sourceId: admission.sourceId,
    outcome: result.state,
    consumedPass: false,
    advancePendingAttempt: true,
    hosted: {
      admission,
      target: admission.target,
      requestedCoverage: admission.requestedCoverage,
      effectiveCoverage: null,
      ...(admission.vehicle?.kind === "delivery-member" ? { vehicle: admission.vehicle } : {}),
      reviewTarget: admission.reviewTarget,
      requirement: admission.requirement,
      actorIdentity: admission.actorIdentity,
      requestFailureReason: result.state === "terminal-failure" ? result.reason : null,
      dispositionSetId: null,
      dispositionSetLineage: [],
      settledFindingIds: [],
      settlementEvidence: [],
    },
    now: input.now,
  });
}

function findingIdsMatch(recorded: readonly string[], approved: readonly string[]): boolean {
  return new Set(approved).size === approved.length
    && canonicalize(approved) === canonicalize(recorded);
}

function recordOnlySettlementEvidence(
  hosted: NonNullable<LaneAttempt["hosted"]>,
  dispositionSetId: string,
  noHostSettlementFindingIds: readonly string[],
  dispositionByFindingId: Map<string, {
    findingId: string;
    disposition: "fix" | "defer" | "reject";
    channelAction: "record-only" | "reply-and-resolve";
  }>,
  now: string,
): NonNullable<LaneAttempt["hosted"]>["settlementEvidence"] {
  return [
    ...hosted.settlementEvidence,
    ...noHostSettlementFindingIds
      .filter((findingId) => !hosted.settlementEvidence.some((evidence) =>
        evidence.dispositionSetId === dispositionSetId && evidence.findingId === findingId))
      .map((findingId) => {
        const finding = dispositionByFindingId.get(findingId);
        if (finding === undefined) throw new Error("hosted settlement references an unknown disposition");
        return {
          findingId,
          dispositionSetId: dispositionSetId,
          disposition: finding.disposition,
          channelAction: "record-only" as const,
          performedAt: now,
          carriedFromDispositionSetId: null,
        };
      }),
  ];
}

function isHostedDispositionReplay(
  hosted: NonNullable<LaneAttempt["hosted"]>,
  dispositionSetId: string,
  findingDispositions: readonly {
    findingId: string;
    disposition: "fix" | "defer" | "reject";
    channelAction: "record-only" | "reply-and-resolve";
  }[],
): boolean {
  if (hosted.dispositionSetId !== null
    && hosted.dispositionSetId !== dispositionSetId) {
    throw new Error("hosted lane attempt already binds a different disposition set");
  }
  if (hosted.dispositionSetId === dispositionSetId) {
    const currentActions = hosted.dispositionSetLineage.at(-1)?.findingActions;
    if (canonicalize(currentActions ?? null) !== canonicalize(findingDispositions)) {
      throw new Error("hosted disposition binding replay conflicts with the recorded action plan");
    }
    return true;
  }
  return false;
}

/** Bind approval to one hosted findings attempt and settle findings with no host-side action. */
export async function bindHostedAttemptDisposition(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingDispositions: readonly {
      findingId: string;
      disposition: "fix" | "defer" | "reject";
      channelAction: "record-only" | "reply-and-resolve";
    }[];
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
  const recordedFindingIds = attempt.hosted.sealedResult?.findings.map(({ findingId }) => findingId).sort() ?? [];
  const dispositionFindingIds = input.findingDispositions.map(({ findingId }) => findingId).sort();
  if (!findingIdsMatch(recordedFindingIds, dispositionFindingIds)) {
    throw new Error("approved disposition details do not cover the hosted finding set");
  }
  const dispositionByFindingId = new Map(input.findingDispositions.map((finding) => [finding.findingId, finding]));
  const noHostSettlementFindingIds = input.findingDispositions
    .filter(({ channelAction }) => channelAction === "record-only")
    .map(({ findingId }) => findingId);
  if (isHostedDispositionReplay(attempt.hosted, input.dispositionSetId, input.findingDispositions)) {
    return state;
  }
  const settledFindingIds = [...new Set([
    ...attempt.hosted.settledFindingIds,
    ...noHostSettlementFindingIds,
  ])].sort();
  if (settledFindingIds.some((findingId) => !recordedFindingIds.includes(findingId))) {
    throw new Error("hosted settlement references an unknown finding");
  }
  const settlementEvidence = recordOnlySettlementEvidence(
    attempt.hosted, input.dispositionSetId, noHostSettlementFindingIds, dispositionByFindingId, input.now,
  );
  const attempts = [...state.attempts];
  const boundAttempt: LaneAttempt = {
    ...attempt,
    outcome: "findings",
    hosted: {
      ...attempt.hosted,
      dispositionSetId: input.dispositionSetId,
      dispositionSetLineage: attempt.hosted.dispositionSetId === null
        ? [{
            dispositionSetId: input.dispositionSetId,
            predecessorDispositionSetId: null,
            successorDispositionSetId: null,
            findingActions: [...input.findingDispositions],
          }]
        : attempt.hosted.dispositionSetLineage,
      settledFindingIds,
      settlementEvidence,
    },
  };
  attempts[index] = completeHostedAttemptIfReady(boundAttempt, input.now);
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

/** Record successful host-side settlement for one approved finding and close the attempt when complete. */
function isApprovedHostedFindingAttempt(
  attempt: LaneAttempt | undefined,
  dispositionSetId: string,
  findingId: string,
): attempt is LaneAttempt & { hosted: NonNullable<LaneAttempt["hosted"]> } {
  return attempt !== undefined
    && attempt.hosted !== undefined
    && (attempt.outcome === "findings" || attempt.outcome === "settled-findings")
    && attempt.hosted.dispositionSetId === dispositionSetId
    && attempt.hosted.sealedResult?.findings.some((finding) => finding.findingId === findingId) === true;
}

export async function settleHostedAttemptFinding(
  store: ReviewOperationStateStore,
  input: {
    operationId: string;
    attemptId: string;
    dispositionSetId: string;
    findingId: string;
    disposition: "fix" | "defer" | "reject";
    actorIdentity: string;
    target: HostedTarget;
    fixTarget: HostedTarget | null;
    commentId: string;
    threadId: string;
    replyDigest: string;
    replyId: string;
    now: string;
  },
): Promise<LaneProgressState> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  if (!isApprovedHostedFindingAttempt(attempt, input.dispositionSetId, input.findingId)) {
    throw new Error("hosted finding settlement does not match the approved lane attempt");
  }
  const evidence = {
    findingId: input.findingId,
    dispositionSetId: input.dispositionSetId,
    disposition: input.disposition,
    channelAction: "reply-and-resolve" as const,
    actorIdentity: input.actorIdentity,
    target: input.target,
    fixTarget: input.fixTarget,
    commentId: input.commentId,
    threadId: input.threadId,
    replyDigest: input.replyDigest,
    replyId: input.replyId,
    performedAt: input.now,
    carriedFromDispositionSetId: null,
  };
  const currentEvidence = attempt.hosted.settlementEvidence.find((candidate) =>
    candidate.dispositionSetId === input.dispositionSetId && candidate.findingId === input.findingId);
  const currentDisposition = attempt.hosted.dispositionSetLineage.at(-1)?.findingActions
    .find(({ findingId }) => findingId === input.findingId);
  if (currentDisposition?.disposition !== input.disposition
    || currentDisposition.channelAction !== "reply-and-resolve") {
    throw new Error("hosted finding settlement does not match the approved channel action");
  }
  if (currentEvidence !== undefined) {
    const replayProjection = { ...evidence, performedAt: currentEvidence.performedAt };
    if (canonicalize(currentEvidence) !== canonicalize(replayProjection)) {
      throw new Error("hosted finding settlement conflicts with its recorded evidence");
    }
    return state;
  }
  const settledFindingIds = [...attempt.hosted.settledFindingIds, input.findingId].sort();
  const attempts = [...state.attempts];
  const settledAttempt: LaneAttempt = {
    ...attempt,
    outcome: "findings",
    hosted: {
      ...attempt.hosted,
      settledFindingIds,
      settlementEvidence: [...attempt.hosted.settlementEvidence, evidence],
    },
  };
  attempts[index] = completeHostedAttemptIfReady(settledAttempt, input.now);
  const next = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(next, version);
  return next;
}

export interface HostedDispositionSupersessionResult {
  readonly progress: LaneProgressState;
  readonly carriedFindingIds: readonly string[];
  readonly reopenedFindingIds: readonly string[];
}

export interface HostedDispositionSupersessionInput {
  readonly operationId: string;
  readonly attemptId: string;
  readonly predecessorDispositionSetId: string;
  readonly successorDispositionSetId: string;
  readonly findingDispositions: readonly {
    readonly findingId: string;
    readonly disposition: "fix" | "defer" | "reject";
    readonly channelAction: "record-only" | "reply-and-resolve";
  }[];
  readonly now: string;
}

/** Typed hosted-settlement refusal that a response successor can expose without masking I/O failures. */
export class HostedDispositionSupersessionError extends Error {
  readonly code = "hosted-settlement-conflict" as const;

  constructor(
    readonly reason: "ambiguous-settlement" | "conflicting-successor",
    message: string,
  ) {
    super(message);
    this.name = "HostedDispositionSupersessionError";
  }
}

/**
 * Advance one hosted attempt from an approved disposition set to its exact successor.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Exact predecessor, successor, and approved finding-action bindings.
 * @returns Updated progress plus settlement carry/reopen projection.
 */
function projectSuccessorCarry(
  hosted: NonNullable<LaneAttempt["hosted"]>,
  input: HostedDispositionSupersessionInput,
) {
  const successorByFindingId = new Map(input.findingDispositions.map((finding) => [finding.findingId, finding]));
  const predecessorEvidence = hosted.settlementEvidence.filter(({ dispositionSetId }) =>
    dispositionSetId === input.predecessorDispositionSetId);
  const predecessorEvidenceByFindingId = new Map(predecessorEvidence.map((evidence) => [evidence.findingId, evidence]));
  const predecessorSettledFindingIds = hosted.dispositionSetId === input.predecessorDispositionSetId
    ? hosted.settledFindingIds
    : predecessorEvidence.map(({ findingId }) => findingId);
  if (predecessorSettledFindingIds.some((findingId) => !predecessorEvidenceByFindingId.has(findingId))) {
    throw new HostedDispositionSupersessionError(
      "ambiguous-settlement",
      "hosted predecessor settlement cannot be attributed exactly",
    );
  }
  const carriedEvidence = predecessorSettledFindingIds.flatMap((findingId) => {
    const evidence = predecessorEvidenceByFindingId.get(findingId);
    const successor = successorByFindingId.get(findingId);
    if (evidence === undefined || successor === undefined
      || evidence.disposition !== successor.disposition
      || evidence.channelAction !== successor.channelAction) {
      return [];
    }
    return [{
      ...evidence,
      dispositionSetId: input.successorDispositionSetId,
      carriedFromDispositionSetId: input.predecessorDispositionSetId,
    }];
  });
  const carriedFindingIds = carriedEvidence.map(({ findingId }) => findingId).sort();
  const reopenedFindingIds = predecessorSettledFindingIds
    .filter((findingId) => !carriedFindingIds.includes(findingId))
    .sort();

  return { carriedEvidence, carriedFindingIds, reopenedFindingIds };
}

function replayHostedDispositionSuccessor(
  hosted: NonNullable<LaneAttempt["hosted"]>,
  input: HostedDispositionSupersessionInput,
  state: LaneProgressState,
  carriedEvidence: ReturnType<typeof projectSuccessorCarry>["carriedEvidence"],
  carriedFindingIds: readonly string[],
  reopenedFindingIds: readonly string[],
): HostedDispositionSupersessionResult {
    const predecessorNode = hosted.dispositionSetLineage.find(({ dispositionSetId }) =>
      dispositionSetId === input.predecessorDispositionSetId);
    const successorNode = hosted.dispositionSetLineage.at(-1);
    const currentEvidence = hosted.settlementEvidence.filter(({ dispositionSetId }) =>
      dispositionSetId === input.successorDispositionSetId);
    if (predecessorNode?.successorDispositionSetId !== input.successorDispositionSetId
      || successorNode?.predecessorDispositionSetId !== input.predecessorDispositionSetId
      || canonicalize(successorNode.findingActions) !== canonicalize(input.findingDispositions)
      || canonicalize(currentEvidence) !== canonicalize(carriedEvidence)
      || canonicalize([...hosted.settledFindingIds].sort()) !== canonicalize(carriedFindingIds)) {
      throw new HostedDispositionSupersessionError(
        "conflicting-successor",
        "hosted disposition successor replay conflicts with recorded progress",
      );
    }
    return { progress: state, carriedFindingIds, reopenedFindingIds };
}

function requireHostedSuccessorAttempt(
  state: LaneProgressState,
  input: HostedDispositionSupersessionInput,
) {
  const index = state.attempts.findIndex(({ attemptId }) => attemptId === input.attemptId);
  const attempt = state.attempts[index];
  const hosted = attempt?.hosted;
  if (attempt === undefined
    || hosted === undefined
    || hosted.sealedResult?.outcome !== "findings"
    || (attempt.outcome !== "findings" && attempt.outcome !== "settled-findings")) {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const recordedFindingIds = hosted.sealedResult.findings.map(({ findingId }) => findingId).sort();
  const successorFindingIds = input.findingDispositions.map(({ findingId }) => findingId).sort();
  if (new Set(successorFindingIds).size !== successorFindingIds.length
    || canonicalize(successorFindingIds) !== canonicalize(recordedFindingIds)) {
    throw new Error("successor dispositions do not cover the hosted finding set");
  }
  return { index, attempt, hosted, recordedFindingIds };
}

export async function supersedeHostedAttemptDisposition(
  store: ReviewOperationStateStore,
  input: HostedDispositionSupersessionInput,
): Promise<HostedDispositionSupersessionResult> {
  const { version, state } = await store.readOperation(input.operationId);
  if (state === null || state.kind !== "lane-progress" || state.lane !== "standard") {
    throw new Error("hosted lane findings attempt is unavailable");
  }
  const { index, attempt, hosted, recordedFindingIds } = requireHostedSuccessorAttempt(state, input);
  const { carriedEvidence, carriedFindingIds, reopenedFindingIds } = projectSuccessorCarry(hosted, input);
  if (hosted.dispositionSetId === input.successorDispositionSetId) {
    return replayHostedDispositionSuccessor(
      hosted, input, state, carriedEvidence, carriedFindingIds, reopenedFindingIds,
    );
  }
  if (hosted.dispositionSetId !== input.predecessorDispositionSetId) {
    throw new HostedDispositionSupersessionError(
      "conflicting-successor",
      "hosted disposition successor does not advance the current predecessor",
    );
  }
  const predecessorNode = hosted.dispositionSetLineage.at(-1);
  if (predecessorNode?.dispositionSetId !== input.predecessorDispositionSetId
    || predecessorNode.successorDispositionSetId !== null) {
    throw new HostedDispositionSupersessionError(
      "conflicting-successor",
      "hosted disposition predecessor is stale or already superseded",
    );
  }
  const dispositionSetLineage = [
    ...hosted.dispositionSetLineage.slice(0, -1),
    { ...predecessorNode, successorDispositionSetId: input.successorDispositionSetId },
    {
      dispositionSetId: input.successorDispositionSetId,
      predecessorDispositionSetId: input.predecessorDispositionSetId,
      successorDispositionSetId: null,
      findingActions: [...input.findingDispositions],
    },
  ];
  const attempts = [...state.attempts];
  attempts[index] = {
    ...attempt,
    outcome: carriedFindingIds.length === recordedFindingIds.length
      ? "settled-findings"
      : "findings",
    hosted: {
      ...hosted,
      dispositionSetId: input.successorDispositionSetId,
      dispositionSetLineage,
      settledFindingIds: carriedFindingIds,
      settlementEvidence: [...hosted.settlementEvidence, ...carriedEvidence],
    },
  };
  const progress = LaneProgressStateSchema.parse({ ...state, updatedAt: input.now, attempts });
  await store.publishOperation(progress, version);
  return { progress, carriedFindingIds, reopenedFindingIds };
}

/**
 * Validate and project a hosted disposition successor without publishing it.
 *
 * @param store - Versioned lane-progress owner to inspect.
 * @param input - Exact predecessor, successor, and approved finding-action bindings.
 * @returns The same carry/reopen projection that publication would produce.
 */
export async function inspectHostedAttemptDispositionSupersession(
  store: ReviewOperationStateStore,
  input: HostedDispositionSupersessionInput,
): Promise<HostedDispositionSupersessionResult> {
  return supersedeHostedAttemptDisposition({
    readOperation: (operationId) => store.readOperation(operationId),
    publishOperation: (_state, expectedVersion) => Promise.resolve({ version: expectedVersion + 1 }),
  }, input);
}

/**
 * Persist one explicit next-pass authorization beside its terminal producer.
 *
 * @param store - Versioned lane-progress owner to update.
 * @param input - Authorizer, producer, lineage, and named-pass bindings.
 * @returns Updated progress and the stable authorization identity.
 */
