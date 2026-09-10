/** Exact predecessor and correction-range binding for one incremental review. */

import { z } from "zod";

import {
  GitObjectIdSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";

/** Source-neutral correction scope admitted before an incremental evaluator runs. */
export const IncrementalReviewScopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  predecessorProducerId: ReviewIdentifierSchema,
  predecessorHeadSha: GitObjectIdSchema,
  basisHeadSha: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  requiredFindingIds: z.array(z.string().trim().min(1)),
}).superRefine((scope, context) => {
  if (new Set(scope.requiredFindingIds).size !== scope.requiredFindingIds.length) {
    context.addIssue({
      code: "custom",
      path: ["requiredFindingIds"],
      message: "incremental correction finding instructions must be unique",
    });
  }
});

export type IncrementalReviewScope = z.infer<typeof IncrementalReviewScopeSchema>;
