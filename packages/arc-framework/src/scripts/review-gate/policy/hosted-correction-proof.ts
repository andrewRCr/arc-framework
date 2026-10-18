/** Existing current-head correction grounds for hosted reservation coverage. */
import { confirmReviewCorrectionLeg } from "./review-next-pass.js";
import type { PerformedResponseProofInput } from "./performed-response-proof.js";
import { deriveHostedReviewTarget } from "./hosted-review-target.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { GitExec } from "../../../lib/git/exec.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewResult } from "../core/review-result.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import type { EarlierHostedAttemptApplicabilityRead } from "./earlier-review-applicability.js";
import { confirmExactCurrentCorrectionPredecessor, incrementalApplicabilityFromEarlierRead } from "./hosted-reservation-support.js";

/** Confirm the exact current producer or the earlier applicability reader's retained producer. */
export async function confirmHostedCurrentCorrection(input: {
  readonly predecessor: ReviewResult;
  readonly currentHeadSha: string;
  readonly approvedHeadSha: string;
  readonly baseRevision: string;
  readonly currentRepositoryId: string;
  readonly currentLineage?: LaneSubjectLineage;
  readonly vehicle?: DeliveryReviewMemberVehicle;
  readonly exec: GitExec;
  readonly cwd: string;
  readonly readEarlierAttemptApplicability?: (sourceId: string) => Promise<EarlierHostedAttemptApplicabilityRead>;
} & Pick<PerformedResponseProofInput, "dispositionStore" | "readResponsePerformance" | "candidateProof">): Promise<IncrementalPredecessorApplicability> {
  if (input.currentLineage === undefined || input.currentHeadSha !== input.approvedHeadSha) return "unavailable";
  const currentTarget = await deriveHostedReviewTarget({ ...input, approvedHeadSha: input.currentHeadSha }).catch(() => null);
  if (currentTarget === null) return "unavailable";
  const confirmGrounds = async () => {
    if (await confirmExactCurrentCorrectionPredecessor(input)) return "applicable";
    const sourceId = input.predecessor.kind === "hosted" ? input.predecessor.sourceIdentity
      : input.predecessor.kind === "attested-local" ? "delegated-agent" : undefined;
    if (sourceId === undefined || input.readEarlierAttemptApplicability === undefined) return "unavailable";
    return incrementalApplicabilityFromEarlierRead({ producerId: input.predecessor.producerId,
      producerTarget: input.predecessor.target, earlier: await input.readEarlierAttemptApplicability(sourceId) });
  };
  return confirmReviewCorrectionLeg({ ...input, currentTarget, currentLineage: input.currentLineage, confirmGrounds });
}
