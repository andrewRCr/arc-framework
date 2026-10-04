/** Recover one exact pending local admission before resolving fresh evaluator input. */

import { canonicalize } from "../../../lib/kernel/index.js";
import { GitObjectIdSchema, type ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "../core/lane-admission.js";
import { assertLocalReviewClaimBinding } from "../core/local-operation.js";
import type { LocalReviewCoverageAdmission } from "../core/local-review-coverage.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import {
  readAdmittedLocalLaneAttempt, readLaneProgressOwner, readLaneProgressOwnerVersioned, recordLaneAttempt,
} from "../lane-progress.js";
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

async function pendingAdmissionMatches(
  state: LocalReviewState,
  subject: Awaited<ReturnType<LocalPrepareDependencies["resolveVehicle"]>>,
  lineage: LaneSubjectLineage,
  request: LocalPrepareRequest,
  dependencies: LocalPrepareDependencies,
): Promise<boolean> {
  const sameDelivery = request.deliveryAdmission === undefined
    || canonicalize(request.deliveryAdmission) === canonicalize(state.deliveryAdmission ?? null);
  return canonicalize(state.vehicle) === canonicalize(subject.vehicle)
    && state.request.authorIdentity === subject.authorIdentity
    && laneSubjectOwnerMatches(state.lineage, lineage)
    && sameDelivery
    && await readAdmittedLocalLaneAttempt(dependencies.operationStore, state) !== null;
}

async function retireStalePendingAdmission(
  state: LocalReviewState,
  attempt: PendingAttempt,
  ownerVersion: number,
  readCurrentTarget: () => Promise<ReviewTarget>,
  dependencies: LocalPrepareDependencies,
): Promise<boolean> {
  const currentTarget = await readCurrentTarget();
  const confirmation = await dependencies.confirmTarget(state.target);
  if (confirmation.state === "current") {
    const selectedTarget = state.targetId === currentTarget.targetId
      ? currentTarget : await readCurrentTarget();
    if (state.targetId === selectedTarget.targetId) return false;
  }
  const receipts = (await dependencies.readReceipts(state.targetId)).receipts
    .filter((receipt) => receipt.requestId === state.requestId);
  if (receipts.length > 1) throw new LocalPrepareCommandError("local review operation has multiple terminal receipts");
  if (receipts.length === 1) return false;
  const source = await dependencies.sourceStore.readSource(state.sourceRef);
  if (source === null || source.sourceDigest !== state.sourceDigest || source.targetId !== state.targetId) {
    throw new LocalPrepareCommandError("local review source reference mismatch");
  }
  const memberHead = state.vehicle.kind === "delivery-member" ? state.target.headSha : undefined;
  const { authority } = await dependencies.resolveAuthority(
    state.request.evaluatorIdentity, memberHead, state.deliveryAdmission,
  );
  if (canonicalize(authority.vehicle) !== canonicalize(state.vehicle)
    || authority.authorIdentity !== state.request.authorIdentity
    || authority.evaluatorIdentity !== state.request.evaluatorIdentity
    || authority.attestationRuntimeKind !== state.attestationRuntimeKind
    || authority.attestationMechanism !== state.attestation.mechanism) {
    throw new LocalPrepareCommandError("local pending admission authority mismatch");
  }
  await recordLaneAttempt(dependencies.operationStore, {
    lane: "standard", repositoryId: state.repositoryId, changeRequestId: attempt.changeRequestId,
    headSha: state.target.headSha, lineage: state.lineage, attemptId: state.operationId,
    sourceId: state.laneSourceId, logicalPass: state.logicalPass, retryGeneration: state.retryGeneration,
    outcome: "stale-target", consumedPass: false, advancePendingAttempt: true,
    local: attempt.local, expectedOwnerVersion: ownerVersion, now: dependencies.now(),
  });
  return true;
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
 * Replay a current owned pending operation, or retire its stale target before fresh preparation.
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
    const { state: owner, version: ownerVersion } = await readLaneProgressOwnerVersioned(dependencies.operationStore, lock);
    const pending = owner?.attempts.filter((attempt) => attempt.outcome === "pending"
      && attempt.local !== undefined) ?? [];
    if (pending.length === 0) return null;
    if (pending.length !== 1) {
      throw new LocalPrepareCommandError("multiple pending local admissions claim the same review owner");
    }
    const attempt = pending[0];
    const binding = attempt?.local;
    if (attempt === undefined || binding === undefined) {
      throw new LocalPrepareCommandError("local pending admission is incomplete");
    }
    const state = (await dependencies.operationStore.readOperation(binding.operationId)).state;
    if (state?.kind !== "local-review"
      || !await pendingAdmissionMatches(state, subject, lineage, request, dependencies)) {
      throw new LocalPrepareCommandError("local pending admission does not match its live owner and operation");
    }
    assertLocalReviewClaimBinding(state);
    if (await retireStalePendingAdmission(state, attempt, ownerVersion,
      () => dependencies.deriveTarget(repositoryId, subject.member ?? undefined), dependencies)) return null;
    const result = await replay({
      request: replayRequestFromState(request, state),
      repositoryId,
      target: state.target,
      lineage: state.lineage,
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
