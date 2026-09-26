/** Typed local coverage recovery derived from immutable predecessor evidence. */

import { canonicalize } from "../../../lib/kernel/index.js";
import type { RawGitExec } from "../../../lib/change-facts.js";
import { proveGitDeliveryContribution } from "../../../lib/delivery/git-contribution-proof.js";
import {
  candidateReviewApplicabilitySelections,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";

import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewScopeMode } from "../core/review-primitives.js";
import {
  laneSubjectOwnerMatches,
  type LaneSubjectLineage,
} from "../core/lane-admission.js";
import {
  LocalReviewCoverageAdmissionSchema,
  LocalReviewCoverageSelectionActionSchema,
  type LocalReviewCoverageAdmission,
  type LocalReviewCoverageSelectionAction,
} from "../core/local-review-coverage.js";
import type {
  ApprovedDispositionRecordStore,
  ReviewResultReader,
} from "../core/ports.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import { projectGitReviewContributionApplicability } from
  "./git-review-contribution-applicability.js";
import {
  reduceReviewApplicabilityAuthorityWithMechanicalCarry,
} from "./review-applicability-authority.js";
import { projectMechanicalReviewApplicabilityCarry } from
  "./mechanical-review-applicability-carry.js";
import {
  resolveIncrementalCorrectionScope,
  type IncrementalPredecessorApplicability,
} from "./incremental-coverage-basis.js";
import {
  readIncrementalPredecessorResponseEvidence,
} from "./review-policy-evidence.js";
import type { ReviewResolveEnvelope } from "./review-policy-driver.js";
import type { StandardReviewObligationProjection } from
  "./standard-review-projection-schema.js";

export type LocalReviewCoverageSelectionResolution =
  | { readonly state: "ready"; readonly coverageSelected: boolean }
  | {
      readonly state: "coverage-required";
      readonly action: LocalReviewCoverageSelectionAction;
    };

export function localAttemptCoverageAdmission(input: {
  readonly requestedCoverage: "incremental" | "complete";
  readonly correctionScope?: LocalReviewCoverageAdmission["correctionScope"];
}): LocalReviewCoverageAdmission {
  return LocalReviewCoverageAdmissionSchema.parse({
    requestedCoverage: input.requestedCoverage,
    ...(input.correctionScope === undefined ? {} : { correctionScope: input.correctionScope }),
  });
}

/** One logical pass has one exact requested scope across hosted and local evaluators. */
export function sharedLogicalPassCoverageMatches(
  attempts: readonly {
    readonly logicalPass: number;
    readonly hosted?: {
      readonly requestedCoverage: "incremental" | "complete";
      readonly admission: {
        readonly correctionScope?: LocalReviewCoverageAdmission["correctionScope"];
      };
    };
    readonly local?: {
      readonly requestedCoverage: "incremental" | "complete";
      readonly correctionScope?: LocalReviewCoverageAdmission["correctionScope"];
    };
  }[],
  logicalPass: number,
  coverageAdmission: LocalReviewCoverageAdmission,
): boolean {
  return attempts.every((attempt) => {
    if (attempt.logicalPass !== logicalPass) return true;
    const scope = attempt.hosted === undefined
      ? attempt.local === undefined ? null : localAttemptCoverageAdmission(attempt.local)
      : localAttemptCoverageAdmission({
          requestedCoverage: attempt.hosted.requestedCoverage,
          correctionScope: attempt.hosted.admission.correctionScope,
        });
    return scope === null || canonicalize(scope) === canonicalize(coverageAdmission);
  });
}

/** Select one matching local replay without obscuring a conflicting pending operation. */
export function selectPendingLocalReplayAttempt<Attempt extends {
  readonly outcome: string;
  readonly local?: {
    readonly scopeMode: ReviewScopeMode;
    readonly requestedCoverage: "incremental" | "complete";
    readonly correctionScope?: LocalReviewCoverageAdmission["correctionScope"];
  };
}>(
  attempts: readonly Attempt[],
  scopeMode: ReviewScopeMode,
  coverageAdmission: LocalReviewCoverageAdmission,
): { readonly attempt: Attempt | null; readonly error: string | null } {
  const pending = attempts.filter((attempt) => attempt.outcome === "pending"
    && attempt.local !== undefined);
  if (pending.length > 1) {
    return { attempt: null, error: "local lane has multiple pending admissions" };
  }
  const local = pending[0]?.local;
  if (local?.scopeMode !== undefined && local.scopeMode !== scopeMode) {
    return { attempt: null, error: "local pending admission has a different review scope" };
  }
  if (local !== undefined
    && canonicalize(localAttemptCoverageAdmission(local)) !== canonicalize(coverageAdmission)) {
    return { attempt: null, error: "local pending admission has different review coverage" };
  }
  return { attempt: pending[0] ?? null, error: null };
}

/** Prove a non-delivery predecessor against current contribution and exact Candidate authority. */
export async function confirmNonDeliveryIncrementalApplicability(input: {
  readonly predecessor: ReviewResult;
  readonly currentTarget: ReviewTarget;
  readonly currentLineage: LaneSubjectLineage;
  readonly repository: string;
  readonly pullRequest: number | null;
  readonly candidate: CandidateManagedRecordV1 | null;
  readonly exec: RawGitExec;
  readonly observeTarget: () => Promise<ReviewTarget>;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, currentTarget, currentLineage } = input;
  if (predecessor.kind === "frontline"
    || predecessor.repositoryId !== currentTarget.repositoryId
    || !laneSubjectOwnerMatches(predecessor.admission.lineage, currentLineage)
    || input.pullRequest === null
    || (currentLineage.kind === "candidate"
      && input.candidate?.attestation.candidateId !== currentLineage.candidateId)) {
    return "unavailable";
  }
  const selector = {
    schemaVersion: 1 as const,
    repositoryId: currentTarget.repositoryId,
    repository: input.repository,
    pullRequest: input.pullRequest,
    lane: "standard" as const,
    sourceId: predecessor.sourceIdentity,
    priorAttemptId: predecessor.producerId,
    priorHead: predecessor.target.headSha,
    currentHead: currentTarget.headSha,
    priorBase: predecessor.target.diffBaseSha,
    currentBase: currentTarget.diffBaseSha,
  };
  const projectSelector = (value: typeof selector) => projectGitReviewContributionApplicability({
    selector: value,
    exec: input.exec,
    observeEndpoints: async () => {
      const observed = await input.observeTarget();
      if (observed.targetId !== currentTarget.targetId) {
        throw new Error("The local review target moved during contribution proof.");
      }
      // A selected A→B leg is historical; its endpoints are pinned by the Candidate.
      // Check the live C target on every read, then prove the immutable B endpoint.
      return { head: value.currentHead, base: value.currentBase };
    },
  });
  const projection = await projectSelector(selector);
  if (currentLineage.kind !== "candidate") {
    return projection.state === "applicable"
      ? "applicable"
      : projection.state === "decision-required" ? "review-required" : "unavailable";
  }
  if (input.candidate === null) return "unavailable";
  const selections = candidateReviewApplicabilitySelections(input.candidate);
  const carried = projection.state !== "decision-required"
    ? []
    : await projectMechanicalReviewApplicabilityCarry({
        candidateId: currentLineage.candidateId,
        projection,
        selections,
        projectSelector,
      });
  const authority = reduceReviewApplicabilityAuthorityWithMechanicalCarry(
    currentLineage.candidateId,
    projection,
    selections,
    carried,
  );
  return authority.state === "applicable"
    ? "applicable"
    : authority.state === "review-required"
      ? "review-required"
      : "unavailable";
}

/** Prove one private or hosted delivery member from exact, live member coordinates. */
export async function confirmDeliveryMemberIncrementalApplicability(input: {
  readonly predecessor: ReviewResult;
  readonly currentTarget: ReviewTarget;
  readonly currentLineage: LaneSubjectLineage;
  readonly exec: RawGitExec;
  readonly observeTarget: () => Promise<ReviewTarget>;
}): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, currentTarget, currentLineage } = input;
  if (predecessor.kind === "frontline"
    || predecessor.target.kind !== "delivery-member"
    || currentTarget.kind !== "delivery-member"
    || currentLineage.kind !== "delivery-member"
    || predecessor.repositoryId !== currentTarget.repositoryId
    || !laneSubjectOwnerMatches(predecessor.admission.lineage, currentLineage)) {
    return "unavailable";
  }
  try {
    if ((await input.observeTarget()).targetId !== currentTarget.targetId) return "unavailable";
    const proof = await proveGitDeliveryContribution({
      exec: input.exec,
      before: {
        predecessor: {
          head: predecessor.target.diffBaseSha,
          tree: predecessor.target.diffBaseTree,
        },
        member: { head: predecessor.target.headSha, tree: predecessor.target.headTree },
      },
      after: {
        predecessor: { head: currentTarget.diffBaseSha, tree: currentTarget.diffBaseTree },
        member: { head: currentTarget.headSha, tree: currentTarget.headTree },
      },
    });
    if ((await input.observeTarget()).targetId !== currentTarget.targetId) return "unavailable";
    if (proof.status === "accepted") return "applicable";
    return (proof.reason === "contribution-diverged" || proof.reason === "contribution-conflicted")
      && proof.paths.length > 0 ? "review-required" : "unavailable";
  } catch {
    return "unavailable";
  }
}

type ErrandFixApplicabilityInput = {
  readonly predecessor: ReviewResult;
  readonly currentTarget: ReviewTarget;
  readonly currentLineage: LaneSubjectLineage;
  readonly currentClaimId: string | null;
  readonly currentResult?: ReviewResult;
  readonly observeTarget: () => Promise<ReviewTarget>;
  readonly dispositionStore: ApprovedDispositionRecordStore;
  readonly readResponsePerformance: (
    predecessor: ReviewResult,
  ) => Promise<LaneResponsePerformance | null>;
};

function exactErrandClaimMatches(input: ErrandFixApplicabilityInput): boolean {
  const { predecessor, currentLineage, currentClaimId, currentResult } = input;
  if (currentClaimId === null || predecessor.kind !== "attested-local"
    || currentLineage.kind !== "head-bound") return false;
  const priorVehicle = predecessor.vehicle;
  const priorCarrier = predecessor.request.carrier;
  if (priorVehicle.kind !== "errand"
    || priorVehicle.identity !== currentLineage.vehicleIdentity
    || priorVehicle.claimId !== currentClaimId
    || priorCarrier.kind !== "local-change-set"
    || priorCarrier.errandClaimId !== currentClaimId) return false;
  if (currentResult === undefined) return true;
  return currentResult.kind === "attested-local"
    && currentResult.vehicle.kind === "errand"
    && currentResult.vehicle.identity === currentLineage.vehicleIdentity
    && currentResult.vehicle.claimId === currentClaimId
    && currentResult.request.carrier.kind === "local-change-set"
    && currentResult.request.carrier.errandClaimId === currentClaimId;
}

function exactErrandResponseContext(input: ErrandFixApplicabilityInput): boolean {
  const { predecessor, currentTarget, currentLineage } = input;
  return predecessor.kind === "attested-local"
    && predecessor.originalOutcome === "findings"
    && predecessor.target.kind === "change-set"
    && currentTarget.kind === "change-set"
    && predecessor.admission.lineage.kind === "head-bound"
    && predecessor.admission.lineage.vehicleKind === "errand"
    && currentLineage.kind === "head-bound"
    && currentLineage.vehicleKind === "errand"
    && predecessor.repositoryId === currentTarget.repositoryId
    && laneSubjectOwnerMatches(predecessor.admission.lineage, currentLineage)
    && exactErrandClaimMatches(input)
    && predecessor.target.baseRef === currentTarget.baseRef
    && predecessor.target.diffBaseSha === currentTarget.diffBaseSha
    && predecessor.target.diffBaseTree === currentTarget.diffBaseTree;
}

/** Carry one Candidate-free Errand across its exact approved and performed fix commit. */
export async function confirmErrandFixResponseApplicability(
  input: ErrandFixApplicabilityInput,
): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, currentTarget } = input;
  if (!exactErrandResponseContext(input)) return "unavailable";
  try {
    if (canonicalize(await input.observeTarget()) !== canonicalize(currentTarget)) return "unavailable";
    const performance = await input.readResponsePerformance(predecessor);
    if (performance === null
      || performance.producerId !== predecessor.producerId
      || performance.originatingHeadSha !== predecessor.target.headSha
      || performance.producedHeadSha !== currentTarget.headSha) return "unavailable";
    const response = await readIncrementalPredecessorResponseEvidence(
      predecessor,
      input.dispositionStore,
      () => Promise.resolve(performance),
    );
    if (response.status !== "performed") return "unavailable";
    return canonicalize(await input.observeTarget()) === canonicalize(currentTarget)
      ? "applicable" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function resolveOfferedCorrectionScope(
  input: Parameters<typeof resolveLocalReviewCoverageSelection>[0],
  dependencies: Parameters<typeof resolveLocalReviewCoverageSelection>[1],
  predecessorOperationId: string,
  completedPasses: number,
) {
  const predecessor = await dependencies.resultReader.readResult(predecessorOperationId).catch(() => null);
  if (predecessor === null || predecessor.kind === "frontline"
    || predecessor.repositoryId !== input.target.repositoryId
    || predecessor.admission.logicalPass !== completedPasses
    || !laneSubjectOwnerMatches(predecessor.admission.lineage, input.lineage)
    || canonicalize({
      obligation: predecessor.requirement.obligation,
      reasons: [...predecessor.requirement.reasons].sort(),
      rubricVersion: predecessor.requirement.rubricVersion,
      rubricDigest: predecessor.requirement.rubricDigest,
      retrigger: predecessor.requirement.retrigger,
      count: predecessor.requirement.count,
    }) !== canonicalize({
      ...input.standardReview,
      reasons: [...input.standardReview.reasons].sort(),
    })) return null;
  return resolveIncrementalCorrectionScope({
    predecessor,
    currentHeadSha: input.target.headSha,
  }, {
    resultReader: dependencies.resultReader,
    readResponseEvidence: (candidate) => readIncrementalPredecessorResponseEvidence(
      candidate,
      dependencies.dispositionStore,
      dependencies.readResponsePerformance,
    ),
    confirmApplicability: dependencies.confirmIncrementalApplicability
      ?? ((earlier, current) => Promise.resolve(
        laneSubjectOwnerMatches(earlier.admission.lineage, current.admission.lineage)
          ? "applicable"
          : "unavailable",
      )),
    confirmCurrentApplicability: (candidate, currentHeadSha) =>
      currentHeadSha !== input.target.headSha
        ? Promise.resolve("unavailable" as const)
        : dependencies.confirmCurrentApplicability?.(candidate, input.target)
          ?? Promise.resolve("unavailable" as const),
  });
}

/**
 * Resolve an optional local coverage selection against current immutable predecessor evidence.
 *
 * @param input - Current policy result, local target, and optional caller-returned coverage choice.
 * @param dependencies - Immutable result and approved-response readers.
 * @returns A typed selection action, or a validated signal that policy may admit the operation.
 */
export async function resolveLocalReviewCoverageSelection(input: {
  readonly policy: ReviewResolveEnvelope;
  readonly target: ReviewTarget;
  readonly sourceId: string;
  readonly lineage: LaneSubjectLineage;
  readonly standardReview: StandardReviewObligationProjection;
  readonly predecessorOperationId?: string;
  readonly coverageAdmission?: LocalReviewCoverageAdmission;
}, dependencies: {
  readonly resultReader: ReviewResultReader;
  readonly dispositionStore: ApprovedDispositionRecordStore;
  readonly readResponsePerformance?: (
    predecessor: ReviewResult,
  ) => Promise<LaneResponsePerformance | null>;
  readonly confirmIncrementalApplicability?: (
    predecessor: ReviewResult,
    current: ReviewResult,
  ) => Promise<IncrementalPredecessorApplicability>;
  readonly confirmCurrentApplicability?: (
    predecessor: ReviewResult,
    currentTarget: ReviewTarget,
  ) => Promise<IncrementalPredecessorApplicability>;
}): Promise<LocalReviewCoverageSelectionResolution> {
  if (input.policy.state !== "coverage-required" && input.policy.state !== "ready") {
    if (input.coverageAdmission?.requestedCoverage === "incremental") {
      throw new Error("Incremental local review coverage requires a current correction selection.");
    }
    return { state: "ready", coverageSelected: false };
  }

  const terminal = input.policy.payload.attemptedSources.at(-1);
  const predecessorOperationId = input.policy.state === "coverage-required"
    && terminal !== undefined
    && "reviewOperationId" in terminal
    ? terminal.reviewOperationId
    : input.predecessorOperationId;
  const completedPasses = input.policy.state === "coverage-required"
    ? input.policy.payload.completedPasses
    : input.policy.payload.pass - 1;
  if (predecessorOperationId === undefined) {
    if (input.coverageAdmission?.requestedCoverage === "incremental") {
      throw new Error("Incremental local review coverage requires a current correction selection.");
    }
    return { state: "ready", coverageSelected: false };
  }
  const correctionScope = await resolveOfferedCorrectionScope(
    input, dependencies, predecessorOperationId, completedPasses,
  );
  const choices: LocalReviewCoverageAdmission[] = [
    ...(correctionScope === null
      ? []
      : [{ requestedCoverage: "incremental" as const, correctionScope }]),
    { requestedCoverage: "complete" },
  ];
  const action = LocalReviewCoverageSelectionActionSchema.parse({
    schemaVersion: 1,
    kind: "local-review-coverage-selection",
    sourceId: input.sourceId,
    target: input.target,
    pass: input.policy.payload.pass,
    completedPasses,
    consumedPass: true,
    choices,
    interactionText: "Select one listed coverage admission and re-run `arc review local prepare` with it.",
  });
  if (input.coverageAdmission === undefined) return { state: "coverage-required", action };
  if (!choices.some((choice) => canonicalize(choice) === canonicalize(input.coverageAdmission))) {
    throw new Error("Local review coverage selection does not match a current offered choice.");
  }
  return {
    state: "ready",
    coverageSelected: input.policy.state === "coverage-required",
  };
}
