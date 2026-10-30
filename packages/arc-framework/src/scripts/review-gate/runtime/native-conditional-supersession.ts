/** Native conditional supersession reads immutable grants and their actual admission citations. */
import { nativeReviewDecisionWasConsumed } from "./native-decision-consumption.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { NativeReviewFactPorts, ReviewOperationStateSnapshotIndex } from "../core/ports.js";
import type { inspectConditionalNextPassInvalidation } from "../lane-progress-conditional.js";
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";

/** Proposed response succession and the invocation's complete native authority readers. */
export interface NativeConditionalSupersessionInput extends NativeReviewFactPorts {
  inFlight: ReviewOperationStateSnapshotIndex;
  supersession: Parameters<typeof inspectConditionalNextPassInvalidation>[1];
}

/** Inspect consumption without publishing a mutable invalidation status. */
export async function inspectNativeConditionalPassSupersession(input: NativeConditionalSupersessionInput):
  Promise<Awaited<ReturnType<typeof inspectConditionalNextPassInvalidation>>> {
  const request = input.supersession;
  if (await input.readProjectId() !== request.repositoryId) {
    throw new Error("Restore the response's project identity before retrying conditional supersession.");
  }
  const listing = await input.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  const keys = listing.records.flatMap(({ value }) => {
    const choice = value.choice;
    return choice.kind === "extra-pass" && choice.precondition.kind === "approved-fix"
      && value.lane === request.lane && laneSubjectOwnerMatches(value.subject.lineage, request.lineage)
      && choice.precondition.repositoryId === request.repositoryId && choice.precondition.originatingHeadSha === request.headSha
      && choice.precondition.producerId === request.producerId && choice.precondition.dispositionSetId === request.dispositionSetId
      ? [reviewDecisionKey(value)] : [];
  });
  return await nativeReviewDecisionWasConsumed(input, input.inFlight, new Set(keys))
    ? { state: "refused", reason: "fix-consumed", detail: "This conditional pass was consumed; replay its approved response and finish or retry the admitted pass." }
    : { state: "ready" };
}
