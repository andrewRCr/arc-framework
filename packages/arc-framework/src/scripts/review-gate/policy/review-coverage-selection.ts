/** Typed operator choice for recovering from inadequate review coverage. */

import { z } from "zod";

import { SlugSchema } from "../../../lib/kernel/schema/slug.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "../core/review-pass.js";
import { HostedReviewCoverageSchema } from "../hosted/request.js";

const ReviewSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

export const ReviewCoverageSelectionChoiceSchema = z.strictObject({
  sourceId: ReviewSourceIdSchema,
  coverage: HostedReviewCoverageSchema,
});
export type ReviewCoverageSelectionChoice = z.infer<typeof ReviewCoverageSelectionChoiceSchema>;

export const ReviewCoverageSelectionActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("review-coverage-selection"),
  workUnitId: SlugSchema,
  sourceId: ReviewSourceIdSchema,
  pass: ReviewPassSchema,
  completedPasses: CompletedReviewPassCountSchema,
  consumedPass: z.literal(true),
  choices: z.array(ReviewCoverageSelectionChoiceSchema).min(1).readonly(),
  interactionText: z.string().trim().min(1),
});
export type ReviewCoverageSelectionAction = z.infer<typeof ReviewCoverageSelectionActionSchema>;

/** Resolve one explicit source-and-coverage pair against the offered choices. */
export function selectReviewCoverageChoice(
  action: ReviewCoverageSelectionAction,
  selection: {
    readonly sourceId?: string;
    readonly coverage?: z.infer<typeof HostedReviewCoverageSchema>;
  },
): ReviewCoverageSelectionChoice | null {
  if (selection.sourceId === undefined || selection.coverage === undefined) return null;
  return action.choices.find((choice) => (
    choice.sourceId === selection.sourceId && choice.coverage === selection.coverage
  )) ?? null;
}
