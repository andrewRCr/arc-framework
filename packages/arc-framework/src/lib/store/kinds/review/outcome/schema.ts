/** Immutable results of ended review attempts. */
import { z } from "zod";
import {
  LaneAttemptOutcomeSchema, LaneAttemptSchema,
} from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import {
  ReviewTargetSchema, ReviewRequirementV2Schema,
} from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import { LaneSubjectLineageSchema } from "../../../../../scripts/review-gate/core/lane-admission.js";
import { NormalizedReviewFindingsSchema } from "../../../../../scripts/review-gate/core/finding-records.js";
import { IncrementalReviewScopeSchema } from "../../../../../scripts/review-gate/core/incremental-review-scope.js";

import { LocalOutcomeBindingSchema } from "./local.js";
import { FrontlineOutcomeBindingSchema } from "./frontline.js";
import { validateReviewOutcome } from "./validation.js";

const hostedShape = LaneAttemptSchema.shape.hosted.unwrap().shape;
export const HostedOutcomeBindingSchema = z.strictObject({
  admission: hostedShape.admission,
  handle: hostedShape.handle,
  target: hostedShape.target,
  requestedCoverage: hostedShape.requestedCoverage,
  effectiveCoverage: hostedShape.effectiveCoverage,
  vehicle: hostedShape.vehicle,
  reviewTarget: hostedShape.reviewTarget,
  requirement: hostedShape.requirement,
  actorIdentity: hostedShape.actorIdentity,
  requestFailureReason: hostedShape.requestFailureReason,
  sealedResult: hostedShape.sealedResult,
});

const ReviewOutcomeObjectSchema = z.strictObject({
  schemaVersion: z.literal(1),
  attemptId: LaneAttemptSchema.shape.attemptId,
  lane: z.enum(["frontline", "standard"]),
  lineage: LaneSubjectLineageSchema,
  logicalPass: LaneAttemptSchema.shape.logicalPass,
  retryGeneration: LaneAttemptSchema.shape.retryGeneration,
  source: z.strictObject({ sourceId: LaneAttemptSchema.shape.sourceId, kind: z.enum(["local", "frontline", "hosted"]) }),
  target: ReviewTargetSchema,
  requestedCoverage: hostedShape.requestedCoverage,
  effectiveCoverage: hostedShape.effectiveCoverage,
  correctionScope: IncrementalReviewScopeSchema.optional(),
  chunkSeriesComplete: z.boolean().optional(),
  outcome: LaneAttemptOutcomeSchema.exclude(["pending", "settled-findings"]),
  findings: NormalizedReviewFindingsSchema,
  requirement: ReviewRequirementV2Schema.optional(),
  admittedBy: z.string().min(1).optional(),
  endedAt: z.iso.datetime({ offset: true }),
  hosted: HostedOutcomeBindingSchema.optional(),
  frontline: FrontlineOutcomeBindingSchema.optional(),
  local: LocalOutcomeBindingSchema.optional(),
});
export type ReviewOutcome = z.infer<typeof ReviewOutcomeObjectSchema>;
export const ReviewOutcomeSchema = ReviewOutcomeObjectSchema.superRefine(validateReviewOutcome);
