/** Corrective remedies for pre-publication command refusals. */

import { attestNewRootArgv, spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { CanonicalDigest } from "../../../lib/kernel/canonical/canonical-json.js";
import type { CandidateApplicabilityDecisionSelection } from
  "../../../lib/work-unit/candidate-applicability-resolution.js";
import { projectCandidateReRootContinuation } from "../../../lib/work-unit/candidate-effective-target.js";
import { routingReasonDifference } from "../policy/routing-reason-facts.js";
import type { StandardReviewObligationProjection } from "../policy/standard-review-projection-schema.js";
import type { ReviewPrePublicationRefusalCode } from "./review-command-envelope.js";

/** The standard-review routing a refused review producer was admitted with, beside the one this call composed. */
export interface PrePublicationRoutingMismatch {
  readonly producerReview: StandardReviewObligationProjection;
  readonly requestReview: StandardReviewObligationProjection;
}

/** How pre-publication continues past a Candidate whose current subject it cannot recognize. */
export type PrePublicationCandidateContinuation =
  /** A bounded decision only an explicit authority selection settles; its selector binds the resolution input. */
  | { readonly kind: "resolve-applicability"; readonly applicability: CandidateApplicabilityDecisionSelection }
  /** A subject outside the Candidate lineage, cleared only by a deliberate re-root over that exact subject. */
  | { readonly kind: "establish-new-root"; readonly candidateId: CanonicalDigest; readonly subjectDigest: CanonicalDigest }
  /** Any other condition, reported in the refusal's message and cleared before re-entry. */
  | { readonly kind: "re-enter" };

/** The idempotent pre-publication re-attempt — the resume point every refusal returns to. */
function prePublicationResumeArgv(workUnit: string): readonly string[] {
  return ["arc", "review", "pre-publication", workUnit];
}

const PRE_PUBLICATION_REMEDIES: Record<
  ReviewPrePublicationRefusalCode,
  (workUnit: string) => SpineRemedy
> = {
  "invalid-input": (workUnit) => spineRemedy(
    "Pre-publication resolves only a request it can read.",
    "Correct the reported input, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "project-identity-unavailable": (workUnit) => spineRemedy(
    "Pre-publication requires the selected project's stable identity.",
    "Restore the project identity record, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "store-refused": (workUnit) => spineRemedy(
    "Pre-publication reads and writes only through a store that serves its review records.",
    "Apply the store's reported remedy, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "corrupt-state": (workUnit) => spineRemedy(
    "Pre-publication reduces only intact durable review evidence.",
    "Repair the reported durable record, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "uncertain-provider-execution": (workUnit) => spineRemedy(
    "A frontline provider may have started without a durable outcome.",
    "Inspect the provider run and settle an explicit retry decision, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "unexpected-failure": (workUnit) => spineRemedy(
    "A refused pre-publication leaves the Candidate resumable at the same boundary.",
    "Resolve the reported failure, then re-run",
    prePublicationResumeArgv(workUnit),
  ),
  "candidate-unexplained-delta": (workUnit) => spineRemedy(
    "Pre-publication review requires the current reviewable subject to belong to the verified Candidate lineage.",
    "Run full verification, then establish a new Candidate root",
    attestNewRootArgv(workUnit),
  ),
  "attestation-ordering-conflict": (workUnit) => spineRemedy(
    "Pre-publication review cannot cross an unacknowledged post-attestation head change.",
    "Re-enter the pending continuation and select its explicit recovery action",
    prePublicationResumeArgv(workUnit),
  ),
  "post-attest-judgment-mismatch": (workUnit) => spineRemedy(
    "A pending post-attestation continuation retains its recorded Owner judgments.",
    "Re-enter the pending continuation with its saved resume command",
    prePublicationResumeArgv(workUnit),
  ),
  "review-in-progress": (workUnit) => spineRemedy(
    "An admitted review attempt must finish before pre-publication can evaluate its result.",
    "Complete the pending review operation, then re-enter pre-publication",
    prePublicationResumeArgv(workUnit),
  ),
  "scope-judgment-required": (workUnit) => spineRemedy(
    "The recorded review producer used a scope different from the selected lane scope.",
    "Supply an explicit per-lane scope judgment, then re-enter pre-publication",
    [...prePublicationResumeArgv(workUnit), "--lanes", "-"],
  ),
};

/**
 * Resolve the corrective remedy for one pre-publication refusal.
 *
 * @param code - The typed refusal shape the envelope reports.
 * @param workUnit - The refused work unit, interpolated into the resume command.
 * @returns The remedy naming the failed invariant and one corrective command.
 */
export function prePublicationRemedy(code: ReviewPrePublicationRefusalCode, workUnit: string): SpineRemedy {
  return PRE_PUBLICATION_REMEDIES[code](workUnit);
}

/**
 * Compose the remedy, and any decision payload, for one Candidate pre-publication cannot recognize.
 *
 * The refusal code alone cannot say which of these applies, so the composed continuation selects it: a bounded
 * decision names the resolver its selector feeds, a subject outside the lineage names the re-root bound to it, and
 * every other condition names the re-attempt that observes it again.
 *
 * @param workUnit - The refused work unit, interpolated into the corrective command.
 * @param continuation - The typed continuation pre-publication composed for the Candidate.
 * @returns The corrective remedy, with the decision and its selector when an authority selection is required.
 */
export function prePublicationCandidateRefusal(
  workUnit: string,
  continuation: PrePublicationCandidateContinuation,
): { remedy: SpineRemedy; applicability?: CandidateApplicabilityDecisionSelection } {
  switch (continuation.kind) {
    case "resolve-applicability":
      return {
        remedy: spineRemedy(
          "Pre-publication review requires an explicit authority selection for a Candidate delta it cannot settle "
            + "mechanically.",
          "Add selectedBy and choice (covered, targeted-check, or changed; targeted-check also takes "
            + "targetedEvidenceRef) to the carried resolutionSelector, then run",
          ["arc", "candidate", "applicability", "resolve", workUnit, "-"],
        ),
        applicability: continuation.applicability,
      };
    case "establish-new-root":
      return {
        remedy: spineRemedy(
          "Pre-publication review requires the current reviewable subject to belong to the verified Candidate lineage.",
          "Run full verification, then establish a new Candidate root over that subject",
          projectCandidateReRootContinuation({
            name: workUnit,
            candidateId: continuation.candidateId,
            subjectDigest: continuation.subjectDigest,
          }).argv,
        ),
      };
    case "re-enter":
      return {
        remedy: spineRemedy(
          "Pre-publication review requires a Candidate whose current target it can read and recognize.",
          "Resolve the reported Candidate condition, then re-run",
          prePublicationResumeArgv(workUnit),
        ),
      };
  }
}

function routingMismatchCorrection({ producerReview, requestReview }: PrePublicationRoutingMismatch): string {
  const routed = `the review was prepared routing as ${[...producerReview.reasons].sort().join(", ")}; this call `
    + `routes as ${[...requestReview.reasons].sort().join(", ")}`;
  const difference = routingReasonDifference(producerReview.reasons, requestReview.reasons);
  const changed = (["obligation", "retrigger", "rubricVersion", "rubricDigest", "count"] as const)
    .filter(field => producerReview[field] !== requestReview[field]);
  // A rubric change or a reason only the repository produces is one no change set can reproduce.
  if (difference.repositoryReasons.length > 0) {
    return `Prepare a fresh review under the current routing (${routed}; ${difference.repositoryReasons.join(", ")} `
      + "come from method activity or project policy, not --change-set), then re-run";
  }
  if (changed.some(field => field === "rubricVersion" || field === "rubricDigest")) {
    return `Prepare a fresh review under the current rubric (${changed.join(", ")} changed after the review was `
      + "prepared), then re-run";
  }
  if (difference.unestablished === "prepared") {
    return `Omit --change-set, as the review was prepared without established change-set facts (${routed}), then re-run`;
  }
  if (difference.unestablished === "current") {
    const asPrepared = difference.facts.length > 0 ? `, ${difference.facts.join(", ")} as the review was prepared` : "";
    return `Supply --change-set with every fact${asPrepared} (${routed}; an absent or rejected fact leaves the change `
      + "set unestablished), then re-run";
  }
  if (difference.facts.length > 0) {
    return `Set ${difference.facts.join(", ")} in --change-set as the review was prepared (${routed}), then re-run`;
  }
  return `Prepare a fresh review under the current review policy (${changed.join(", ")} changed after the review `
    + "was prepared), then re-run";
}

/**
 * Compose the remedy for a review producer whose admitted routing this call's routing does not reproduce.
 *
 * The caller cannot set the standard-review projection the producer's own correction names, only the change-set facts
 * it is routed from, so the remedy names those facts; a difference no fact explains names a fresh review instead.
 *
 * @param workUnit - The refused work unit, interpolated into the resume command.
 * @param mismatch - The producer's admitted routing and this call's.
 * @returns The remedy naming the differing facts, or the fresh review a policy change needs.
 */
export function prePublicationRoutingMismatchRemedy(workUnit: string, mismatch: PrePublicationRoutingMismatch): SpineRemedy {
  return spineRemedy(
    "Pre-publication settles a review only under the routing it was prepared with.",
    routingMismatchCorrection(mismatch),
    prePublicationResumeArgv(workUnit),
  );
}

/**
 * Resolve the remedy for a refusal whose own work-unit operand never resolved.
 *
 * The resume command interpolates a slug, so a refusal that rejected the operand itself has no
 * exact re-attempt to name; it names the discovery that produces a usable one instead.
 *
 * @returns The remedy naming work-unit discovery.
 */
export function prePublicationTargetRemedy(): SpineRemedy {
  return spineRemedy(
    "Pre-publication runs against one existing work unit.",
    "Name an existing work unit, then re-run",
    ["arc", "status", "--project", "--json"],
  );
}
