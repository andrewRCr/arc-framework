/** Corrective remedies for pre-publication command refusals. */

import { attestNewRootArgv, spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { ReviewPrePublicationRefusalCode } from "./review-command-envelope.js";

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
