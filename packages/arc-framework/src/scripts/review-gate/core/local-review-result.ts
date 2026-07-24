/** Strict normalized result returned by a local standard-review evaluator. */

import { z } from "zod";

import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";
import { NormalizedReviewFindingSchema } from "./finding-records.js";

export const NormalizedLocalReviewResultSchema = z.strictObject({
  status: z.enum(["complete", "partial", "unavailable", "failed"]),
  result: z.enum(["clean", "findings"]).nullable(),
  targetId: ReviewCanonicalDigestSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  sourceDigest: ReviewCanonicalDigestSchema,
  guidanceDigest: ReviewCanonicalDigestSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  reviewRunId: ReviewIdentifierSchema,
  applicabilityId: ReviewCanonicalDigestSchema.nullable(),
  findings: z.array(NormalizedReviewFindingSchema),
}).superRefine((result, context) => {
  if (result.status === "complete" && (result.result === "findings") !== (result.findings.length > 0)) {
    context.addIssue({
      code: "custom",
      message: "complete finding results must carry normalized findings",
      path: ["findings"],
    });
  }
  if (result.status !== "complete" && result.findings.length > 0) {
    context.addIssue({ code: "custom", message: "incomplete results cannot carry findings", path: ["findings"] });
  }
});
export type NormalizedLocalReviewResult = z.infer<typeof NormalizedLocalReviewResultSchema>;
