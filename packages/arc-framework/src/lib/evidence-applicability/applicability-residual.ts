/** The bounded path residual the applicability classifiers carry from a D4 contribution proof. */

import {
  BoundedEvidenceResidualSchema,
  MAX_EVIDENCE_APPLICABILITY_PATH_BYTES,
  MAX_EVIDENCE_APPLICABILITY_PATHS,
  type BoundedEvidenceResidual,
} from "./schema.js";

/** What one residual's paths established against the bounds; each classifier states the refusal itself. */
export type ApplicabilityResidual =
  | { readonly status: "bounded"; readonly paths: BoundedEvidenceResidual }
  | { readonly status: "empty" }
  | { readonly status: "unbounded" }
  | { readonly status: "malformed"; readonly issues: string };

/**
 * Hold one proof's residual paths to the evidence residual's bounds and canonical order.
 *
 * The proof emits paths in that order, so a list out of it is refused as malformed rather than re-sorted.
 */
export function boundApplicabilityResidual(paths: readonly string[]): ApplicabilityResidual {
  if (paths.length === 0) return { status: "empty" };
  const bytes = new TextEncoder().encode(paths.join("\0")).byteLength;
  if (paths.length > MAX_EVIDENCE_APPLICABILITY_PATHS || bytes > MAX_EVIDENCE_APPLICABILITY_PATH_BYTES) {
    return { status: "unbounded" };
  }
  const bounded = BoundedEvidenceResidualSchema.safeParse(paths);
  return bounded.success
    ? { status: "bounded", paths: bounded.data }
    : { status: "malformed", issues: bounded.error.issues.map(({ message }) => message).join("; ") };
}
