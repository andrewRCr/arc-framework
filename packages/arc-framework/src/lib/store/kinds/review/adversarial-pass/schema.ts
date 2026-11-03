/** Typed advisory pass headers with activity-specific artifact bindings and evaluator prose. */
import { z } from "zod";
import { RecordVersionSchema } from "../../../identity.js";
import { GitObjectIdSchema, ReviewIdentifierSchema } from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import { ReviewRubricIdentitySchema } from "../../../../../scripts/review-gate/policy/standard-review-schema.js";

export const ReviewAdversarialActivitySchema = z.enum([
  "draft-readiness", "spec-finalization", "task-generation", "design-amendment", "verification", "criteria",
]);
const ApprovalSchema = z.strictObject({ approvedBy: ReviewIdentifierSchema, approvedAt: z.iso.datetime({ offset: true }) });
export const ReviewAdversarialPassHeaderShape = {
  schemaVersion: z.literal(1), rubric: ReviewRubricIdentitySchema,
  pass: z.strictObject({ number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    cap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  ...ApprovalSchema.shape, overCapApproval: ApprovalSchema.nullable().optional(),
  stopReason: z.enum(["converged", "cap-exhausted", "suspended", "re-entered", "owner-accepted"]).nullable(),
  dispositions: z.array(z.strictObject({ findingId: z.string().trim().min(1), action: z.enum(["fix", "defer", "reject"]), account: z.string() })),
  report: z.string(),
};
const TaskArtifactsSchema = z.strictObject({ spec: RecordVersionSchema, taskList: RecordVersionSchema });
const ReviewAdversarialPassObjectSchema = z.discriminatedUnion("activity", [
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("draft-readiness"), artifacts: z.strictObject({ draft: RecordVersionSchema }) }),
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("spec-finalization"),
    artifacts: z.strictObject({ spec: RecordVersionSchema, draft: RecordVersionSchema.optional() }) }),
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("task-generation"), artifacts: TaskArtifactsSchema }),
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("design-amendment"), artifacts: TaskArtifactsSchema }),
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("verification"), artifacts: TaskArtifactsSchema, codeHead: GitObjectIdSchema }),
  z.strictObject({ ...ReviewAdversarialPassHeaderShape, activity: z.literal("criteria"), artifacts: TaskArtifactsSchema, codeHead: GitObjectIdSchema }),
]);
export type ReviewAdversarialPass = z.infer<typeof ReviewAdversarialPassObjectSchema>;
/** Enforce approval and finding uniqueness consistently at input and storage boundaries. */
export function validateReviewAdversarialPassHeader(value: {
  dispositions: readonly { findingId: string }[]; pass: { number: number; cap: number }; overCapApproval?: unknown;
}, context: z.RefinementCtx): void {
  const ids = value.dispositions.map(({ findingId }) => findingId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["dispositions"],
    message: "each finding has exactly one approved disposition" });
  if (value.pass.number > value.pass.cap && value.overCapApproval == null) context.addIssue({ code: "custom",
    path: ["overCapApproval"], message: "a pass over the cap requires its own approval" });
}
export const ReviewAdversarialPassSchema = ReviewAdversarialPassObjectSchema.superRefine(validateReviewAdversarialPassHeader);
