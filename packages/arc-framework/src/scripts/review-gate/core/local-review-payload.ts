/** Strict evaluator payloads for one immutable local review source. */

import { z } from "zod";

import {
  StandardReviewGuidanceProjectionSchema,
} from "../policy/standard-review-guidance.js";
import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
} from "./gate-contract-v2-schema.js";
import { IncrementalReviewScopeSchema } from "./incremental-review-scope.js";

const DurableReferenceSchema = z.string().trim().min(1);

export const LocalReviewSourcePayloadSchema = z.strictObject({
  reviewRoot: z.string().min(1),
  diffBaseSha: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  sourceRef: DurableReferenceSchema,
  sourceDigest: ReviewCanonicalDigestSchema,
  correctionScope: IncrementalReviewScopeSchema.optional(),
});
export type LocalReviewSourcePayload = z.infer<typeof LocalReviewSourcePayloadSchema>;

export const LocalReviewerPayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ...LocalReviewSourcePayloadSchema.shape,
  guidance: StandardReviewGuidanceProjectionSchema,
  guidanceDigest: ReviewCanonicalDigestSchema,
  reviewerInstructions: z.string().min(1),
});
export type LocalReviewerPayload = z.infer<typeof LocalReviewerPayloadSchema>;
