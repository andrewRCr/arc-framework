/** Immutable envelopes for review choices outside Candidate selections. */
import { z } from "zod";
import { LaneSubjectLineageSchema } from "../../../../../scripts/review-gate/core/lane-admission.js";
import { GitObjectIdSchema, ReviewCanonicalDigestSchema, ReviewIdentifierSchema } from
  "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema } from "../../../../../scripts/review-gate/core/review-pass.js";

const ExtraPassPreconditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ceiling") }),
  z.strictObject({ kind: z.literal("additional"), precedingProducerId: ReviewIdentifierSchema }),
  z.strictObject({ kind: z.literal("approved-fix"), repositoryId: ReviewIdentifierSchema,
    producerId: ReviewIdentifierSchema, dispositionSetId: ReviewCanonicalDigestSchema,
    originatingHeadSha: GitObjectIdSchema, exhaustedPassCount: CompletedReviewPassCountSchema }),
]);
const DecisionChoiceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("extra-pass"), passCount: CompletedReviewPassCountSchema.max(Number.MAX_SAFE_INTEGER - 1),
    precondition: ExtraPassPreconditionSchema }),
  z.strictObject({ kind: z.literal("terminus") }),
  z.strictObject({ kind: z.literal("lane-skip") }),
  z.strictObject({ kind: z.literal("withdrawal"), decisionKey: ReviewCanonicalDigestSchema }),
]);

const ReviewDecisionObjectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  subject: z.strictObject({ lineage: LaneSubjectLineageSchema, headSha: GitObjectIdSchema.nullable(),
    subjectDigest: ReviewCanonicalDigestSchema.nullable() }),
  lane: z.enum(["frontline", "standard"]), choice: DecisionChoiceSchema,
  decidedBy: ReviewIdentifierSchema.nullable(), decidedAt: z.iso.datetime({ offset: true }).nullable(),
  basis: z.strictObject({ passCount: CompletedReviewPassCountSchema }).nullable(),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionObjectSchema>;
export const ReviewDecisionSchema = ReviewDecisionObjectSchema.superRefine((value, context) => {
  const fail = (message: string) => { context.addIssue({ code: "custom", message }); };
  const choice = value.choice;
  if ((choice.kind === "terminus") !== (value.basis !== null)) fail("only a terminus carries a pass-count basis");
  if (choice.kind === "terminus" && (value.lane !== "standard"
    || (value.subject.lineage.kind === "candidate" && value.subject.headSha !== null))) {
    fail("a terminus binds the standard lane and a Candidate terminus carries no head");
  }
  if (choice.kind === "lane-skip" && value.lane !== "frontline") fail("only the frontline lane can be skipped");
  if (choice.kind !== "extra-pass") return;
  const precondition = choice.precondition;
  if (precondition.kind === "additional" && value.lane !== "standard") fail("an additional pass belongs to the standard lane");
  if (precondition.kind === "approved-fix" && (value.decidedBy === null
    || value.subject.headSha !== precondition.originatingHeadSha || value.subject.subjectDigest !== null
    || choice.passCount !== precondition.exhaustedPassCount)) {
    fail("an approved-fix decision must retain its authorizer, originating head, and logical pass without a subject digest");
  }
});
