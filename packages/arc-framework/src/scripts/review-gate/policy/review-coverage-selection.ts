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

/** A missing choice leaves the offer pending; an explicit unmatched choice carries the allowed pairs. */
export type ReviewCoverageSelectionResult = { readonly state: "offered" }
  | { readonly state: "selected"; readonly choice: ReviewCoverageSelectionChoice }
  | { readonly state: "refused"; readonly detail: string };

/** Resolve a listed pair, or an unambiguous coverage-only choice, without silently repeating an invalid pick. */
export function selectReviewCoverageChoice(
  action: ReviewCoverageSelectionAction,
  selection: {
    readonly sourceId?: string;
    readonly coverage?: z.infer<typeof HostedReviewCoverageSchema>;
  },
): ReviewCoverageSelectionResult {
  if (selection.coverage === undefined) return { state: "offered" };
  const matches = action.choices.filter(choice => choice.coverage === selection.coverage
    && (selection.sourceId === undefined || choice.sourceId === selection.sourceId));
  if (matches.length === 1 && matches[0] !== undefined) return { state: "selected", choice: matches[0] };
  return { state: "refused", detail: "Select exactly one listed source and coverage choice: "
    + action.choices.map(choice => `${choice.sourceId} / ${choice.coverage}`).join(", ") + "." };
}
