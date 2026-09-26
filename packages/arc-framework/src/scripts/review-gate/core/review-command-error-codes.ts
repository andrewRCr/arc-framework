/** Error codes shared by review commands and the pre-publication spine. */

import { z } from "zod";

export const ReviewCommandErrorCodeSchema = z.enum([
  "invalid-input",
  "corrupt-state",
  "uncertain-provider-execution",
  "unexpected-failure",
]);
export type ReviewCommandErrorCode = z.infer<typeof ReviewCommandErrorCodeSchema>;

export const ReviewPrePublicationRefusalCodeSchema = z.enum([
  ...ReviewCommandErrorCodeSchema.options,
  "candidate-unexplained-delta",
  "attestation-ordering-conflict",
  "post-attest-judgment-mismatch",
  "review-in-progress",
  "scope-judgment-required",
]);
export type ReviewPrePublicationRefusalCode = z.infer<typeof ReviewPrePublicationRefusalCodeSchema>;

/** Every shape the pre-publication verb refuses with, for exhaustive iteration. */
export const REVIEW_PRE_PUBLICATION_REFUSAL_CODES: readonly ReviewPrePublicationRefusalCode[] =
  ReviewPrePublicationRefusalCodeSchema.options;
