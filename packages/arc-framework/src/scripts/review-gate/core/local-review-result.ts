/** Strict normalized result returned by a local standard-review evaluator. */

import { z } from "zod";

import {
  GitObjectIdSchema,
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";
import { NormalizedReviewFindingSchema } from "./finding-records.js";

const EvaluatorOwnedLocalReviewResultShape = {
  status: z.enum(["complete", "partial", "unavailable", "failed"]),
  result: z.enum(["clean", "findings"]).nullable(),
  evaluatorIdentity: ReviewIdentifierSchema,
  reviewRunId: ReviewIdentifierSchema,
  applicabilityId: ReviewCanonicalDigestSchema.nullable(),
  findings: z.array(NormalizedReviewFindingSchema),
};

const RuntimeOwnedLocalReviewBindingShape = {
  repositoryId: ReviewIdentifierSchema,
  targetId: ReviewCanonicalDigestSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
  rubricVersion: ReviewIdentifierSchema,
  rubricDigest: ReviewCanonicalDigestSchema,
  sourceDigest: ReviewCanonicalDigestSchema,
  guidanceDigest: ReviewCanonicalDigestSchema,
};

function validateResultConsistency(
  result: z.infer<z.ZodObject<typeof EvaluatorOwnedLocalReviewResultShape>>,
  context: z.RefinementCtx,
): void {
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
}

export const LocalReviewEvaluatorResultSchema = z.strictObject({
  ...EvaluatorOwnedLocalReviewResultShape,
  repositoryId: ReviewIdentifierSchema.optional(),
  targetId: ReviewCanonicalDigestSchema.optional(),
  headSha: GitObjectIdSchema.optional(),
  headTree: GitObjectIdSchema.optional(),
  rubricVersion: ReviewIdentifierSchema.optional(),
  rubricDigest: ReviewCanonicalDigestSchema.optional(),
  sourceDigest: ReviewCanonicalDigestSchema.optional(),
  guidanceDigest: ReviewCanonicalDigestSchema.optional(),
}).superRefine(validateResultConsistency);
export type LocalReviewEvaluatorResult = z.infer<typeof LocalReviewEvaluatorResultSchema>;

export const LocalReviewResultBindingsSchema = z.strictObject(RuntimeOwnedLocalReviewBindingShape);
export type LocalReviewResultBindings = z.infer<typeof LocalReviewResultBindingsSchema>;

export const NormalizedLocalReviewResultSchema = z.strictObject({
  ...EvaluatorOwnedLocalReviewResultShape,
  ...RuntimeOwnedLocalReviewBindingShape,
  repositoryId: ReviewIdentifierSchema.optional(),
}).superRefine(validateResultConsistency);
export type NormalizedLocalReviewResult = z.infer<typeof NormalizedLocalReviewResultSchema>;

/** Stable mismatch between optional compatibility bindings and runtime-owned review facts. */
export class LocalReviewResultBindingError extends Error {
  readonly code = "invalid-input" as const;

  constructor(binding: keyof LocalReviewResultBindings) {
    super(`local review result ${binding} does not match the runtime-owned binding`);
    this.name = "LocalReviewResultBindingError";
  }
}

/** Inject immutable runtime facts while rejecting any supplied compatibility mismatch. */
export function normalizeLocalReviewResult(
  input: unknown,
  bindingsInput: LocalReviewResultBindings,
): NormalizedLocalReviewResult {
  const result = LocalReviewEvaluatorResultSchema.parse(input);
  const bindings = LocalReviewResultBindingsSchema.parse(bindingsInput);
  for (const binding of Object.keys(bindings) as (keyof LocalReviewResultBindings)[]) {
    const supplied = result[binding];
    if (supplied !== undefined && supplied !== bindings[binding]) {
      throw new LocalReviewResultBindingError(binding);
    }
  }
  return NormalizedLocalReviewResultSchema.parse({ ...result, ...bindings });
}
