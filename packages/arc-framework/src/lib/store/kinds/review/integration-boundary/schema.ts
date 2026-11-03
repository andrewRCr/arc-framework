/** Public boundary content versions and the backend's opaque read version. */
import type { IntegrationBoundaryLocus } from "../../../../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { IntegrationBoundaryLocusV2 } from "../../../../../scripts/review-gate/policy/integration-boundary-locus-v2.js";
export { IntegrationBoundaryLocusSchema, type IntegrationBoundaryLocus } from "../../../../../scripts/review-gate/policy/integration-boundary-locus.js";
export { IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from "../../../../../scripts/review-gate/policy/integration-boundary-locus-v2.js";

export type ReviewIntegrationBoundary = IntegrationBoundaryLocus | IntegrationBoundaryLocusV2;
/** A present or absent boundary paired with its backend's compare-and-swap version. */
export interface VersionedSubmissionBoundary<TBoundary extends ReviewIntegrationBoundary = ReviewIntegrationBoundary> {
  boundary: TBoundary | null;
  version: string | null;
}
