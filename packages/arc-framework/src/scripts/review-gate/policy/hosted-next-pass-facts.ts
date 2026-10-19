/** Render a hosted coverage offer from the delivery member's own lane history. */
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { ReviewOperationStateStore, ApprovedDispositionRecordStore } from "../core/ports.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import { readReviewLaneHistory } from "../runtime/lane-history.js";
import { deriveNextPassFacts } from "./next-pass-facts.js";
import { nextPassConsiderations } from "./next-pass-offer-text.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";
import type { HostedReservationDischarge } from "./hosted-reservation-support.js";

/** Add the shared observations before requesting advisory judgment; this layer owns no status route. */
export async function groundHostedCoverageOffer(discharge: HostedReservationDischarge, input: {
  readonly lineage: LaneSubjectLineage | undefined;
  readonly target: ReviewTarget;
  readonly store: Pick<ReviewOperationStateStore, "readOperation">;
  readonly dispositionStore: Pick<ApprovedDispositionRecordStore, "readDispositionRecord">;
  readonly nextPassContext: ReviewNextPassContext;
  readonly ceiling: number;
  readonly exec: RawGitExec;
}): Promise<HostedReservationDischarge> {
  const action = discharge.coverageSelectionAction;
  if (action === undefined) return discharge;
  const lineage = input.lineage;
  if (lineage?.kind !== "delivery-member") throw new Error("A hosted coverage offer requires a delivery-member lane owner.");
  const history = await readReviewLaneHistory({ ...input, lineage, repositoryId: input.target.repositoryId,
    headSha: input.target.headSha,
    // Delivery members have independent lane owners, without Candidate supersession inheritance.
    resolveSupersessionAncestors: () => Promise.resolve([]) });
  const facts = await deriveNextPassFacts({ ...input, ...history });
  return { ...discharge, coverageSelectionAction: { ...action, interactionText: [action.interactionText, ...nextPassConsiderations(facts),
    "Recommend the admitted next step. Consider a successor complete pass only after fix checks converge.",
    "What do you recommend, why, and what would change your recommendation?"].join("\n\n") } };
}
