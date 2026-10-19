/** Review obligations for publication boundaries without a hosted-review reservation. */
import type { IntegrationBoundaryLocus } from "../../lib/store/kinds/review/integration-boundary/schema.js";
import type { RoutedReviewObligation } from "./status.js";

/**
 * Read what a publication boundary that reserved no hosted review still owes.
 *
 * Only the loci a Candidate reaches once pre-publication review settles owe nothing. Before that point the
 * boundary's own next step is what is owed, so it is returned unchanged rather than as a fresh review pass.
 *
 * @param boundary - The current boundary, carrying no hosted-review reservation.
 * @returns The settled obligation, the outstanding one carrying the boundary's continuation, or a block for a
 *   locus that cannot exist without a reservation.
 */
export function readUnreservedObligation(boundary: IntegrationBoundaryLocus): RoutedReviewObligation {
  switch (boundary.locus) {
    case "candidate-publish-ready":
    case "publication-pending":
      return { state: "settled", detail: "No hosted review was reserved across publication." };
    case "candidate-review-pending":
    case "candidate-fix-pending":
    case "candidate-convergence-verification-pending":
      return {
        state: "review-required",
        detail: "The Candidate's pre-publication review is not settled.",
        prePublicationAction: boundary.nextAction,
      };
    case "hosted-review-pending":
    case "delivery-status-required":
      return { state: "blocked", detail: "The publication boundary lacks the hosted review reservation it requires." };
  }
}
