/** Public command identities shared by review result and error envelopes. */

import { z } from "zod";

export const ReviewCommandModeSchema = z.enum([
  "review-readiness",
  "review-lane-read",
  "review-resolve",
  "review-frontline-resolve",
  "review-chunking-resolve",
  "review-planning-grooming-resolve",
  "review-frontline-run",
  "review-local-prepare",
  "review-local-attest",
  "review-local-cancel",
  "review-respond",
  "review-reduce",
  "review-local-resume",
  "review-hosted-request",
  "review-hosted-await",
  "review-hosted-settle",
  "review-hosted-dismiss",
  "review-terminus-accept",
  "review-pre-publication",
]);
export type ReviewCommandMode = z.infer<typeof ReviewCommandModeSchema>;
