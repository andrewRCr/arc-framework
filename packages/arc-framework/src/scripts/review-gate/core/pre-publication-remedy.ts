/** Corrective remedies for pre-publication command refusals. */

import { attestNewRootArgv, spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { CanonicalDigest } from "../../../lib/kernel/canonical/canonical-json.js";
import type { CandidateApplicabilityDecisionSelection } from
  "../../../lib/work-unit/candidate-applicability-resolution.js";
import { projectCandidateReRootContinuation } from "../../../lib/work-unit/candidate-effective-target.js";
import type { ReviewPrePublicationRefusalCode } from "./review-command-envelope.js";

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
