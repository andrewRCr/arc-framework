/** Public versioned publication-boundary content and JSON codec. */
export { IntegrationBoundaryLocusSchema, IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocus,
  type IntegrationBoundaryLocusV2, type ReviewIntegrationBoundary, type VersionedSubmissionBoundary } from "./schema.js";
export { parseReviewIntegrationBoundary, decodeReviewIntegrationBoundary } from "./parser.js";
