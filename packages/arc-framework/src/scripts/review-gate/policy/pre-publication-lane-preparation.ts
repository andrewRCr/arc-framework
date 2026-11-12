/** Prepare selected lane progress once and compare saved native grants before composition can record authority. */
import { canonicalize } from "../../../lib/kernel/index.js";
import type { CandidateSupersessionAncestor } from "../../../lib/work-unit/candidate-attestation.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LanePolicyAttempt, LaneProgressProjection } from "../lane-progress.js";
import type { CandidateRead, PrePublicationCompositionDependencies, PrePublicationComposition,
  PrePublicationCompositionInput, ReviewLane, ReviewPolicyTarget } from "./pre-publication-contract.js";
import { frontlineResolveRequestFromAdmission } from "./frontline-command-schema.js";
import { prePublicationGrantContext } from "./pre-publication-lane-judgments.js";

/** A saved explicit input cannot be rebound to the selected composition. */
export class PrePublicationReplayMismatchError extends Error {
  constructor(readonly kind: "judgment" | "scope") { super(`Saved pre-publication ${kind} does not match the selected subject.`); }
}

/** Prepare and reuse only read facts within this one composition invocation. */
export function createPrePublicationLanePreparation(input: PrePublicationCompositionInput,
  candidate: Extract<CandidateRead, { status: "current" }>, dependencies: PrePublicationCompositionDependencies,
  examined: readonly ReviewTarget[]) {
  type Prepared = { rawProgress: LaneProgressProjection; progress: LaneProgressProjection;
    sameHeadCandidate?: LanePolicyAttempt & { headSha: string } };
  const cache = new Map<string, Prepared>();
  const prepare = async (lane: ReviewLane, policyTarget: ReviewPolicyTarget, exactTarget: ReviewTarget | null,
    heads: readonly string[], lineage?: LaneSubjectLineage): Promise<Prepared> => {
    const key = canonicalize({ lane, policyTarget, exactTarget, heads, lineage: lineage ?? null });
    const prior = cache.get(key);
    if (prior !== undefined) return prior;
    const rawProgress = await readComposedLaneProgress(dependencies, lane, policyTarget.headSha, heads, lineage,
      candidateAncestorsForLineage(candidate, lineage));
    const separated = lane === "standard" ? separateSameHeadTerminals(rawProgress, exactTarget) : { progress: rawProgress };
    await refusePendingLaneReview(separated.progress, lane, dependencies);
    const prepared = { rawProgress, ...separated };
    cache.set(key, prepared);
    return prepared;
  };
  const verify = async (policyTarget: ReviewPolicyTarget, exactTarget: ReviewTarget | null,
    heads: readonly string[], lineage: LaneSubjectLineage): Promise<void> => {
    const saved = input.savedGrantChecks;
    if (saved === undefined) return;
    if (candidate.candidateId !== saved.candidateId || candidate.subjectDigest !== saved.subjectDigest
      || (candidate.pendingFixRootHeadSha ?? candidate.headSha) !== saved.rootHeadSha) {
      throw new PrePublicationReplayMismatchError("judgment");
    }
    if (input.scopeJudgmentTarget !== undefined && ![...examined, exactTarget].some(target =>
      target !== null && canonicalize(target) === canonicalize(input.scopeJudgmentTarget))) {
      throw new PrePublicationReplayMismatchError("scope");
    }
    for (const check of saved.checks) {
      const { progress } = await prepare(check.lane, policyTarget, exactTarget, heads, lineage);
      const context = prePublicationGrantContext({ candidate, lane: check.lane, policyTarget, exactTarget, progress, lineage });
      if (!await dependencies.recordedGrantMatches?.({ ...context, judgment: check.judgment })) {
        throw new PrePublicationReplayMismatchError("judgment");
      }
    }
  };
  return { prepare, verify };
}

export class PendingLaneReviewError extends Error {
  constructor(readonly pending: NonNullable<Extract<PrePublicationComposition, { status: "refused" }>["pendingReview"]>) {
    super(`review operation ${pending.operationId} is still in progress`);
  }
}

async function refusePendingLaneReview(progress: LaneProgressProjection, lane: ReviewLane,
  dependencies: PrePublicationCompositionDependencies): Promise<void> {
  if (progress.status !== "recorded") return;
  const pending = progress.attempts.find((attempt) => attempt.outcome === "pending");
  if (pending === undefined) return;
  const handle = pending.hosted?.handle;
  const admission = pending.frontline?.admission;
  const frontlineRequest = admission?.target.kind === "change-set"
    ? frontlineResolveRequestFromAdmission(admission) : null;
  const reference = await dependencies.pendingOperationReference?.(pending);
  const operationRef = reference === undefined ? {} : { operationRef: reference };
  throw new PendingLaneReviewError({
    lane,
    operationId: pending.attemptId,
    sourceId: pending.sourceId,
    kind: pending.local !== undefined ? "local"
      : pending.hosted !== undefined ? "hosted" : "frontline",
    request: pending.local !== undefined
      ? { schemaVersion: 1, operationId: pending.local.operationId ?? pending.attemptId, ...operationRef }
      : handle ? { schemaVersion: 1, handle, ...operationRef } : frontlineRequest,
  });
}

/** Keep an old-base terminal at the same head available for exact applicability proof. */
function separateSameHeadTerminals(
  progress: LaneProgressProjection,
  target: ReviewTarget | null,
): {
  progress: LaneProgressProjection;
  sameHeadCandidate?: LanePolicyAttempt & { headSha: string };
} {
  if (progress.status !== "recorded" || target === null) return { progress };
  const stale = progress.attempts.filter((attempt) => {
    if (attempt.outcome !== "clean" && attempt.outcome !== "settled-findings") return false;
    const producerTarget = attempt.hosted?.reviewTarget ?? attempt.local?.target;
    return producerTarget !== undefined
      && producerTarget.headSha === target.headSha
      && canonicalize(producerTarget) !== canonicalize(target);
  });
  if (stale.length === 0) return { progress };
  const retained = progress.attempts.filter((attempt) => !stale.includes(attempt));
  const latest = [...stale].sort((left, right) => right.logicalPass - left.logicalPass)[0];
  return {
    progress: { ...progress, attempts: retained },
    ...(retained.length === 0 && latest !== undefined
      && stale.filter((attempt) => attempt.logicalPass === latest.logicalPass).length === 1
      ? { sameHeadCandidate: { ...latest, headSha: target.headSha } }
      : {}),
  };
}

function readComposedLaneProgress(
  dependencies: PrePublicationCompositionDependencies,
  lane: ReviewLane,
  headSha: string,
  lineageHeadShas: readonly string[],
  lineage?: LaneSubjectLineage,
  supersessionAncestors: readonly CandidateSupersessionAncestor[] = [],
): Promise<LaneProgressProjection> {
  return lineage === undefined
    ? dependencies.readLaneProgress(lane, headSha, lineageHeadShas)
    : supersessionAncestors.length === 0
      ? dependencies.readLaneProgress(lane, headSha, lineageHeadShas, lineage)
      : dependencies.readLaneProgress(lane, headSha, lineageHeadShas, lineage, supersessionAncestors);
}

function candidateAncestorsForLineage(
  candidate: CandidateRead,
  lineage?: LaneSubjectLineage,
): readonly CandidateSupersessionAncestor[] {
  return lineage?.kind === "candidate" && candidate.status === "current"
    ? candidate.supersessionAncestors ?? [] : [];
}

