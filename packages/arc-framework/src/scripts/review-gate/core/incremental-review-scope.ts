/** Exact predecessor and correction-range binding for one incremental review. */

import { z } from "zod";

import {
  GitObjectIdSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";
import {
  ReviewFindingIdentitySchema,
  ReviewFindingLocusSchema,
} from "./finding-records.js";

/** One immutable material-finding instruction retained across incremental passes. */
export const IncrementalReviewFindingInstructionSchema = z.strictObject({
  producerId: ReviewIdentifierSchema,
  findingId: ReviewFindingIdentitySchema,
  locus: ReviewFindingLocusSchema,
});

export type IncrementalReviewFindingInstruction = z.infer<
  typeof IncrementalReviewFindingInstructionSchema
>;

/** Source-neutral correction scope admitted before an incremental evaluator runs. */
export const IncrementalReviewScopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  predecessorProducerId: ReviewIdentifierSchema,
  predecessorHeadSha: GitObjectIdSchema,
  basisHeadSha: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  requiredFindings: z.array(IncrementalReviewFindingInstructionSchema),
}).superRefine((scope, context) => {
  const byProducer = new Map<string, Set<string>>();
  for (const [index, finding] of scope.requiredFindings.entries()) {
    const findingIds = byProducer.get(finding.producerId) ?? new Set<string>();
    if (findingIds.has(finding.findingId)) {
      context.addIssue({
        code: "custom",
        path: ["requiredFindings", index],
        message: "incremental correction finding instructions must be producer-qualified and unique",
      });
    }
    findingIds.add(finding.findingId);
    byProducer.set(finding.producerId, findingIds);
  }
});

export type IncrementalReviewScope = z.infer<typeof IncrementalReviewScopeSchema>;
