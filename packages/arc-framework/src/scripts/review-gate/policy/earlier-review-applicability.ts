/** Compose earlier-attempt discovery, D4 projection, and canonical Candidate authority. */

import type { RawGitExec } from "../../../lib/change-facts.js";
import {
  candidateReviewApplicabilitySelections,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import { sameDeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { ReviewOperationStateSnapshot } from "../core/ports.js";
import {
  queryEarlierReviewAttempts,
  type EarlierReviewAttemptQuery,
} from "./earlier-review-attempts.js";
import { projectGitReviewContributionApplicability } from
  "./git-review-contribution-applicability.js";
import {
  reduceReviewApplicabilityAuthority,
  reviewApplicabilityConsumerAction,
  type ReviewApplicabilityConsumerAction,
} from "./review-applicability-authority.js";
import type {
  ReviewContributionApplicabilityResult,
} from "./review-contribution-applicability.js";

export type EarlierHostedAttemptApplicabilityRead =
  | {
    readonly status: "complete";
    readonly attempts: readonly {
      readonly sourceId: string;
      readonly outcome: string;
      readonly applicability: ReviewApplicabilityConsumerAction;
    }[];
  }
  | { readonly status: "not-found" }
  | { readonly status: "unavailable"; readonly detail: string };

/** Outcomes whose applicable prior attempt already decides settlement or source fallback. */
export function earlierAttemptRetainsReservationPosition(outcome: string): boolean {
  return outcome === "clean"
    || outcome === "settled-findings"
    || outcome === "rate-limited"
    || outcome === "transient-unavailable";
}

export interface EarlierReviewApplicabilityInput {
  readonly query: EarlierReviewAttemptQuery;
  readonly currentBase: string;
  readonly snapshot: ReviewOperationStateSnapshot;
  readonly candidate: CandidateManagedRecordV1;
  readonly exec: RawGitExec;
  readonly projectApplicability?: (
    selector: Parameters<typeof projectGitReviewContributionApplicability>[0]["selector"],
  ) => Promise<ReviewContributionApplicabilityResult>;
}

/** Whether canonical authority proves that this exact current query must still find its prior attempt. */
export function candidateExpectsEarlierReviewAttempt(
  candidate: CandidateManagedRecordV1,
  query: EarlierReviewAttemptQuery,
): boolean {
  return candidateReviewApplicabilitySelections(candidate).some((selection) => (
    selection.selector.repositoryId === query.repositoryId
    && selection.selector.repository === query.repository.toLowerCase()
    && selection.selector.pullRequest === query.pullRequest
    && selection.selector.currentHead === query.currentHead
    && selection.selector.lane === query.lane
    && selection.selector.sourceId === query.sourceId
    && sameDeliveryReviewMemberVehicle(selection.selector.currentVehicle, query.currentVehicle)
  ));
}

/** Project every exact earlier candidate without reading or writing authority outside the Candidate. */
export async function projectEarlierReviewApplicability(
  input: EarlierReviewApplicabilityInput,
): Promise<EarlierHostedAttemptApplicabilityRead> {
  const queried = queryEarlierReviewAttempts(input.query, input.snapshot);
  if (queried.status === "unavailable") {
    if (queried.reason === "no-matching-attempt") return { status: "not-found" };
    return { status: "unavailable", detail: queried.detail };
  }
  const selections = candidateReviewApplicabilitySelections(input.candidate);
  const attempts = await Promise.all(queried.candidates.map(async (candidate) => {
    const selector = {
      schemaVersion: 1 as const,
      repositoryId: input.query.repositoryId,
      repository: input.query.repository,
      pullRequest: input.query.pullRequest,
      lane: "standard" as const,
      sourceId: candidate.sourceId,
      priorAttemptId: candidate.attemptId,
      priorHead: candidate.priorHead,
      currentHead: input.query.currentHead,
      priorBase: candidate.reviewTarget.diffBaseSha,
      currentBase: input.currentBase,
      ...(candidate.priorVehicle === undefined
        ? {}
        : { priorVehicle: candidate.priorVehicle, currentVehicle: input.query.currentVehicle }),
    };
    const projection = input.projectApplicability === undefined
      ? await projectGitReviewContributionApplicability({
          selector,
          exec: input.exec,
          observeEndpoints: () => Promise.resolve({ head: input.query.currentHead, base: input.currentBase }),
        })
      : await input.projectApplicability(selector);
    const authority = reduceReviewApplicabilityAuthority(
      input.candidate.attestation.candidateId,
      projection,
      selections,
    );
    return {
      sourceId: candidate.sourceId,
      outcome: candidate.outcome,
      applicability: reviewApplicabilityConsumerAction(authority),
    };
  }));
  return { status: "complete", attempts };
}
