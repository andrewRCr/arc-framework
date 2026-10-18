/** Derive hosted next-look context from exact target coordinates and lane projections. */
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { GitExec } from "../../../lib/git/exec.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { LaneProgressProjection } from "../lane-progress.js";
import type { ReviewResult } from "../core/review-result.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { EvidenceBoundReviewPolicyDependencies } from "./review-policy-evidence.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";
import { deriveReviewNextPassContext } from "./review-next-pass.js";
import type { StandardReviewObligationProjection } from "./standard-review-projection-schema.js";

/** Read the latest completed look in one subject's projected span and derive its next scope. */
export async function deriveHostedNextPassContext(input: {
  readonly target: ReviewTarget;
  readonly lineage?: LaneSubjectLineage;
  readonly progress?: readonly LaneProgressProjection[];
  readonly predecessorId?: string;
  readonly standardReview: StandardReviewObligationProjection;
  readonly evidence: Pick<EvidenceBoundReviewPolicyDependencies,
    "resultReader" | "dispositionStore" | "readResponsePerformance" | "confirmIncrementalApplicability">;
  readonly candidate?: CandidateManagedRecordV1;
  readonly cwd: string;
  readonly exec: GitExec;
  readonly observeTarget: () => Promise<ReviewTarget>;
  readonly confirmCurrentApplicability?: (predecessor: ReviewResult, target: ReviewTarget) => Promise<IncrementalPredecessorApplicability>;
}): Promise<ReviewNextPassContext> {
  const latest = (input.progress ?? []).flatMap(progress => progress.status === "recorded"
    ? [...progress.attempts, ...(progress.historicalAttempt === undefined ? [] : [progress.historicalAttempt])] : [])
    .filter(attempt => attempt.outcome === "clean" || attempt.outcome === "findings" || attempt.outcome === "settled-findings")
    .sort((left, right) => right.logicalPass - left.logicalPass)[0];
  const producerId = input.predecessorId ?? latest?.attemptId;
  const predecessor = producerId === undefined ? null : await input.evidence.resultReader.readResult(producerId);
  const confirmCurrent = input.confirmCurrentApplicability;
  return deriveReviewNextPassContext({ predecessor, currentTarget: input.target,
    currentLineage: input.lineage ?? predecessor?.admission.lineage ?? { kind: "head-bound", vehicleKind: "review-target",
      vehicleIdentity: input.target.targetId, headSha: input.target.headSha },
    standardReview: input.standardReview, resultReader: input.evidence.resultReader,
    dispositionStore: input.evidence.dispositionStore,
    readResponsePerformance: input.evidence.readResponsePerformance ?? (() => Promise.resolve(null)),
    confirmApplicability: input.evidence.confirmIncrementalApplicability,
    confirmCurrentApplicability: confirmCurrent === undefined ? undefined : predecessor => confirmCurrent(predecessor, input.target),
    candidateProof: { candidate: input.candidate ?? null, cwd: input.cwd, exec: input.exec,
      baseRef: input.target.baseRef, observeTarget: input.observeTarget },
  });
}
