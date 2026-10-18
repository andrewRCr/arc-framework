/** Shared read-only composition of local correction applicability and policy-target facts. */
import type { GitExec } from "../../../lib/git/exec.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import { deriveLocalReviewTarget } from "../hosts/local/repository-target.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import type { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import type { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { resolveChangeRequest } from "../change-request.js";
import { readLaneResponsePerformance } from "../lane-progress.js";
import { confirmReviewCorrectionLeg } from "../policy/review-next-pass.js";
import { confirmErrandFixResponseApplicability, confirmPrivateCandidateCorrectionBasis,
  confirmNonDeliveryIncrementalApplicability } from "../policy/local-review-coverage-selection.js";

/** Resolve the exact public or private change-request target without publishing state. */
export async function resolveLocalPolicyTarget(
  input: { cwd: string; exec: GitExec },
  repositoryId: string,
  target: ReviewTarget,
  baseRef: string,
) {
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.cwd,
  })).stdout.trim();
  if (branch === "" || branch === "HEAD") {
    throw new Error("Local review requires an attached originating branch.");
  }
  const changeRequest = await resolveChangeRequest({
    headRef: branch,
    headSha: target.headSha,
    baseRef,
  }, createGhChangeRequestResolutionPort(input.exec, input.cwd));
  if (changeRequest.targetRef !== null && (changeRequest.state === "blocked"
    || changeRequest.state === "ambiguous")) {
    throw new Error("Local review could not resolve exact change-request authority.");
  }
  const policyTarget = changeRequest.targetRef === null
    ? {
        repository: `local/${repositoryId}`,
        pullRequest: null,
        headSha: target.headSha,
      }
    : {
        repository: changeRequest.targetRef.repository,
        pullRequest: changeRequest.state === "open" ? changeRequest.candidate.number : null,
        headSha: target.headSha,
      };
  return policyTarget;
}

/** Bind the exact Errand fix-response bridge and ordinary contribution proof to one live target. */
export function createLocalContributionConfirmation(input: {
  context: {
    input: { cwd: string; exec: GitExec };
    dispositionStore: LocalApprovedDispositionRecordStore;
    operationStore: LocalReviewOperationStateStore;
  };
  repositoryId: string;
  baseRef: string;
  policyTarget: { repository: string; pullRequest: number | null };
  candidate: CandidateManagedRecordV1 | null;
}) {
  const observeTarget = () => deriveLocalReviewTarget({
    ...input.context.input, baseRef: input.baseRef, repositoryId: input.repositoryId,
  });
  const confirmGrounds = async (
    predecessor: ReviewResult,
    currentTarget: ReviewTarget,
    currentLineage: LaneSubjectLineage,
    currentResult?: ReviewResult,
  ) => {
    if (input.policyTarget.pullRequest === null && currentLineage.kind === "head-bound"
      && currentLineage.vehicleKind === "errand") {
      const live = await readLocalReviewLiveContext(input.context.input).catch(() => null);
      return confirmErrandFixResponseApplicability({
        predecessor,
        currentTarget,
        currentLineage,
        currentClaimId: live?.context.errand?.claimId === currentLineage.vehicleIdentity
          ? live.context.errand.claimId : null,
        ...(currentResult === undefined ? {} : { currentResult }),
        observeTarget,
        dispositionStore: input.context.dispositionStore,
        readResponsePerformance: (result) => readLaneResponsePerformance(input.context.operationStore, result),
      });
    }
    if (input.policyTarget.pullRequest === null && currentLineage.kind === "candidate") {
      return confirmPrivateCandidateCorrectionBasis({
        predecessor,
        currentTarget,
        currentLineage,
        ...(currentResult === undefined ? {} : { currentResult }),
        candidate: input.candidate,
        cwd: input.context.input.cwd,
        baseRef: input.baseRef,
        exec: input.context.input.exec,
        observeTarget,
        readResponsePerformance: (result) => readLaneResponsePerformance(
          input.context.operationStore, result,
        ),
      });
    }
    return confirmNonDeliveryIncrementalApplicability({
      predecessor,
      currentTarget,
      currentLineage,
      repository: input.policyTarget.repository,
      pullRequest: input.policyTarget.pullRequest,
      candidate: input.candidate,
      exec: createRawGitExec(input.context.input.cwd),
      observeTarget,
    });
  };
  return (predecessor: ReviewResult, currentTarget: ReviewTarget, currentLineage: LaneSubjectLineage,
    currentResult?: ReviewResult) => confirmReviewCorrectionLeg({
    predecessor, currentTarget, currentLineage, currentResult, rangeProof: input.context.input,
    dispositionStore: input.context.dispositionStore,
    readResponsePerformance: result => readLaneResponsePerformance(input.context.operationStore, result),
    candidateProof: { candidate: input.candidate, ...input.context.input, baseRef: input.baseRef, observeTarget },
    confirmGrounds: () => confirmGrounds(predecessor, currentTarget, currentLineage, currentResult),
  });
}
