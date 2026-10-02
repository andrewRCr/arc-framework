/**
 * The one rule deciding whether a review lane needs another pass once its findings settle.
 *
 * A follow-up pass exists to review the head a material fix produced. A confirmed finding approved as `defer` or
 * `reject` leaves the reviewed head unchanged, so another pass would re-review the same change; only an approved
 * fix of a major or critical finding calls for one. Every lane and every reader of a pass's outcome decides
 * through this module, so the lanes cannot disagree about when review has converged.
 *
 * @module
 */

import { z } from "zod";

import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";
import { ReviewSeveritySchema, type FindingDisposition, type ReviewSeverity } from "./review-primitives.js";

/** The fields of one disposition-set finding that convergence reads. */
export interface ConvergenceFinding {
  readonly disposition: FindingDisposition;
  /** ARC's source-verified grade; `null` when the observation was not supported. */
  readonly verifiedSeverity: ReviewSeverity | null;
}

/**
 * Whether a grade is severe enough that fixing it can require another pass.
 *
 * @param severity - A verified grade, or `null` for an unsupported observation.
 * @returns `true` for `major` and `critical`.
 */
export function isMaterialSeverity(severity: ReviewSeverity | null): boolean {
  return severity === "major" || severity === "critical";
}

/**
 * Whether a disposition set fixes a material finding — the one outcome that requires another pass.
 *
 * @param findings - The proposed or approved disposition set's findings.
 * @returns `true` when any finding is a `fix` of a verified major or critical grade.
 */
export function fixesMaterialFinding(findings: readonly ConvergenceFinding[]): boolean {
  return findings.some((finding) => finding.disposition === "fix" && isMaterialSeverity(finding.verifiedSeverity));
}

/** One terminal pass's verified outcome, derived from its producer and approved dispositions; never caller-asserted. */
export const VerifiedTerminalReviewSignalSchema = z.strictObject({
  reviewOperationId: ReviewIdentifierSchema,
  confirmedFindingCount: z.number().int().nonnegative(),
  maxConfirmedSeverity: ReviewSeveritySchema.nullable(),
  /** Whether the approved dispositions fix a material finding, which alone requires another pass. */
  materialFix: z.boolean(),
  coverageAdequate: z.boolean(),
}).superRefine((signal, context) => {
  if ((signal.confirmedFindingCount === 0) !== (signal.maxConfirmedSeverity === null)) {
    context.addIssue({
      code: "custom",
      message: "confirmed finding count and maximum severity must agree",
      path: ["maxConfirmedSeverity"],
    });
  }
  if (signal.materialFix && !isMaterialSeverity(signal.maxConfirmedSeverity)) {
    context.addIssue({
      code: "custom",
      message: "a material fix requires a major or critical confirmed finding",
      path: ["materialFix"],
    });
  }
}).readonly();
export type VerifiedTerminalReviewSignal = z.infer<typeof VerifiedTerminalReviewSignalSchema>;
