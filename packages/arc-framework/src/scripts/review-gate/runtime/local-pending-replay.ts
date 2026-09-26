/** Recover one exact pending local admission before resolving fresh evaluator input. */

import { canonicalize } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, type ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { LocalReviewCoverageAdmission } from "../core/local-review-coverage.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import type { LocalPrepareDependencies, LocalPrepareRequest } from "./local-prepare.js";
import { LocalPrepareCommandError } from "./local-prepare-error.js";

type PendingAttempt = NonNullable<Awaited<ReturnType<typeof readLaneProgressOwner>>>["attempts"][number];

export interface StablePendingReplayContext {
  request: LocalPrepareRequest;
  repositoryId: string;
  target: ReviewTarget;
  lineage: LaneSubjectLineage;
  scopeMode: ReviewScopeMode;
  coverageAdmission: LocalReviewCoverageAdmission;
  cleanupTtlMs: number;
}

function requestedReplayPass(request: LocalPrepareRequest): number | undefined {
  return request.policyJudgment?.additionalPassAuthorization?.nextPass
    ?? request.deliveryAdmission?.additionalPassAuthorization?.nextPass;
}

/**
 * A completed replay may answer only the pass and target this request names.
 *
 * @param attempt - Durable completed lane attempt.
 * @param input - Target and pass selected by the current request.
 * @returns Whether the completed attempt may be replayed.
 */
export function completedReplayAttemptMatches(
  attempt: PendingAttempt,
  input: Pick<StablePendingReplayContext, "request" | "target" | "scopeMode">,
): boolean {
  const requestedPass = requestedReplayPass(input.request);
  if (!attempt.terminalProducer || attempt.local === undefined) return false;
  if (requestedPass !== undefined && attempt.logicalPass !== requestedPass) return false;
  if (input.request.deliveryAdmission === undefined && attempt.outcome === "settled-findings") return false;
  if (input.request.deliveryAdmission !== undefined
    && attempt.logicalPass !== input.request.deliveryAdmission.pass) return false;
  return attempt.local.scopeMode === input.scopeMode
    && attempt.headSha === input.target.headSha
    && attempt.local.target.targetId === input.target.targetId;
}

function pendingOperationMatches(
  state: LocalReviewState,
  attempt: PendingAttempt,
  subject: Awaited<ReturnType<LocalPrepareDependencies["resolveVehicle"]>>,
  lineage: LaneSubjectLineage,
  request: LocalPrepareRequest,
  headSha: string,
): boolean {
  const binding = attempt.local;
  if (binding === undefined) return false;
  const sameOwner = state.operationId === attempt.attemptId
    && state.operationId === binding.operationId
    && state.requestId === binding.requestId;
  const sameTarget = state.targetId === binding.target.targetId
    && state.target.headSha === headSha;
  const sameContext = canonicalize(state.vehicle) === canonicalize(subject.vehicle)
    && canonicalize(state.lineage) === canonicalize(lineage);
  const sameDelivery = request.deliveryAdmission === undefined
    || canonicalize(request.deliveryAdmission) === canonicalize(state.deliveryAdmission ?? null);
  return sameOwner && sameTarget && sameContext && sameDelivery;
}

function replayRequestFromState(
  request: LocalPrepareRequest,
  state: LocalReviewState,
): LocalPrepareRequest {
  if (state.deliveryAdmission !== undefined) {
    return {
      ...request,
      evaluatorIdentity: state.request.evaluatorIdentity,
      memberHeadObjectId: state.target.headSha,
      deliveryAdmission: state.deliveryAdmission,
    };
  }
  return {
    ...request,
    evaluatorIdentity: state.request.evaluatorIdentity,
    policyJudgment: { ...request.policyJudgment, scopeMode: state.scopeMode },
    coverageAdmission: state.coverageAdmission,
  };
}

/**
 * Replay only the durable exact-head pending operation; otherwise enter fresh preparation.
 *
 * @param request - Caller request, which may contain stale fresh-only selections.
 * @param dependencies - Live repository and operation readers.
 * @param replay - Existing idempotent replay under the same admission locks.
 * @returns The replay result, or null when no pending operation exists.
 */
export async function resolveStablePendingLocalReplay<T>(
  request: LocalPrepareRequest,
  dependencies: LocalPrepareDependencies,
  replay: (context: StablePendingReplayContext) => Promise<T | null>,
): Promise<T | null> {
  const repositoryId = await dependencies.resolveRepositoryId();
  const subject = await dependencies.resolveVehicle(
    request.memberHeadObjectId, request.deliveryAdmission,
  );
  const headSha = GitObjectIdSchema.parse(subject.member?.head ?? await dependencies.readCurrentHeadSha());
  const lineage = await dependencies.resolveLineage(
    subject.vehicle, headSha, request.deliveryAdmission, subject.member ?? undefined,
  );
  const lock = { lane: "standard" as const, repositoryId, headSha, lineage };
  return dependencies.withLaneOperationLock(lock, () => dependencies.withLocalReviewLock(async () => {
    const owner = await readLaneProgressOwner(dependencies.operationStore, lock);
    const pending = owner?.attempts.filter((attempt) => attempt.outcome === "pending"
      && attempt.headSha === headSha && attempt.local !== undefined) ?? [];
    if (pending.length === 0) return null;
    if (pending.length !== 1) {
      throw new LocalPrepareCommandError("multiple pending local admissions claim the exact review head");
    }
    const attempt = pending[0];
    const binding = attempt?.local;
    if (attempt === undefined || binding === undefined) {
      throw new LocalPrepareCommandError("local pending admission is incomplete");
    }
    const state = (await dependencies.operationStore.readOperation(binding.operationId)).state;
    if (state?.kind !== "local-review"
      || !pendingOperationMatches(state, attempt, subject, lineage, request, headSha)) {
      throw new LocalPrepareCommandError("local pending admission does not match its live owner and operation");
    }
    const result = await replay({
      request: replayRequestFromState(request, state),
      repositoryId,
      target: state.target,
      lineage,
      scopeMode: state.scopeMode,
      coverageAdmission: state.coverageAdmission,
      cleanupTtlMs: request.freshnessMs ?? state.cleanupTtlMs,
    });
    if (result === null) {
      throw new LocalPrepareCommandError("local pending admission could not be replayed from its durable operation");
    }
    return result;
  }));
}
