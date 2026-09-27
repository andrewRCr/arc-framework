/** Source-neutral coverage admission for one local review operation. */

import { z } from "zod";

import { HostedReviewCoverageSchema } from "../hosted/request.js";
import {
  ReviewIdentifierSchema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";
import { IncrementalReviewScopeSchema } from "./incremental-review-scope.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "./review-pass.js";

export const LocalReviewCoverageAdmissionSchema = z.strictObject({
  requestedCoverage: HostedReviewCoverageSchema,
  correctionScope: IncrementalReviewScopeSchema.optional(),
}).superRefine((admission, context) => {
  if (admission.requestedCoverage === "incremental" && admission.correctionScope === undefined) {
    context.addIssue({
      code: "custom",
      path: ["correctionScope"],
      message: "incremental local review coverage requires an exact correction scope",
    });
  }
  if (admission.requestedCoverage === "complete" && admission.correctionScope !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["correctionScope"],
      message: "complete local review coverage cannot retain an incremental correction scope",
    });
  }
});
export type LocalReviewCoverageAdmission = z.infer<typeof LocalReviewCoverageAdmissionSchema>;

export const LocalReviewCoverageSelectionActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("local-review-coverage-selection"),
  sourceId: ReviewIdentifierSchema,
  target: ReviewTargetSchema,
  pass: ReviewPassSchema,
  completedPasses: CompletedReviewPassCountSchema,
  consumedPass: z.literal(true),
  choices: z.array(LocalReviewCoverageAdmissionSchema).min(1).readonly(),
  interactionText: z.string().trim().min(1),
});
export type LocalReviewCoverageSelectionAction = z.infer<
  typeof LocalReviewCoverageSelectionActionSchema
>;

/**
 * Project the source-neutral coverage facts from a delivery-specific local admission.
 *
 * @param input - Delivery admission fields that determine local review coverage.
 * @returns The validated source-neutral coverage admission.
 */
export function projectLocalReviewCoverageAdmission(input: {
  readonly requestedCoverage: z.infer<typeof HostedReviewCoverageSchema>;
  readonly correctionScope?: z.infer<typeof IncrementalReviewScopeSchema>;
}): LocalReviewCoverageAdmission {
  return LocalReviewCoverageAdmissionSchema.parse({
    requestedCoverage: input.requestedCoverage,
    ...(input.correctionScope === undefined ? {} : { correctionScope: input.correctionScope }),
  });
}
