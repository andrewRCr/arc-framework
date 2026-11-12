/** Caller-held Git coordinates for deriving a repository-local review target. */

import { z } from "zod";

import {
  GitObjectIdSchema,
  ReviewIdentifierSchema,
  ReviewTargetKindSchema,
} from "./gate-contract-v2-schema.js";

/** Immutable Git facts a caller can hold without fabricating repository-local identity. */
export const ReviewTargetCoordinatesSchema = z.strictObject({
  kind: ReviewTargetKindSchema,
  baseRef: ReviewIdentifierSchema,
  diffBaseSha: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
});
export type ReviewTargetCoordinates = z.infer<typeof ReviewTargetCoordinatesSchema>;
