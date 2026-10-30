/** Closed machine-local pending state, without ended outcomes or response authority. */
import { z } from "zod";
import { OwnerIdentitySchema } from "../../../lib/store/identity.js";
import { LaneAttemptSchema, LaneProgressStateSchema, LocalReviewStateSchema, FrontlineRunStateSchema,
  ReviewSuspensionStateSchema, ReviewOperationStateSchema, type ReviewOperationState } from "./operation-state-schema.js";

const owner = OwnerIdentitySchema.refine(value => value.type === "work-item" && value.uid !== undefined,
  "Native execution requires an exact work-item UID.");
const attempt = LaneAttemptSchema.shape;
const hosted = attempt.hosted.unwrap().shape;
const HostedInFlightBindingSchema = z.strictObject({ admission: hosted.admission, handle: hosted.handle,
  target: hosted.target, requestedCoverage: hosted.requestedCoverage, effectiveCoverage: hosted.effectiveCoverage,
  vehicle: hosted.vehicle, reviewTarget: hosted.reviewTarget, requirement: hosted.requirement, actorIdentity: hosted.actorIdentity });
const ReviewInFlightAttemptSchema = z.strictObject({
  attemptId: attempt.attemptId, logicalPass: attempt.logicalPass, retryGeneration: attempt.retryGeneration,
  changeRequestId: attempt.changeRequestId, headSha: attempt.headSha, sourceId: attempt.sourceId,
  local: attempt.local, frontline: attempt.frontline, hosted: HostedInFlightBindingSchema.optional(),
  admittedBy: z.string().trim().min(1).optional(),
});
export type ReviewInFlightAttempt = z.infer<typeof ReviewInFlightAttemptSchema>;
const lane = LaneProgressStateSchema.shape;
export const ReviewInFlightLaneSchema = z.strictObject({ schemaVersion: lane.schemaVersion,
  semanticsVersion: lane.semanticsVersion, operationId: lane.operationId, updatedAt: lane.updatedAt, workItem: owner,
  kind: lane.kind, lane: lane.lane, repositoryId: lane.repositoryId, lineage: lane.lineage,
  attempts: z.array(ReviewInFlightAttemptSchema),
}).superRefine((value, context) => {
  const passes = value.attempts.map(item => item.logicalPass);
  if (new Set(passes).size !== passes.length) context.addIssue({ code: "custom", path: ["attempts"],
    message: "One logical pass may have only one attempt in flight." });
});
const ReviewInFlightStateSchema = z.discriminatedUnion("kind", [ReviewInFlightLaneSchema,
  LocalReviewStateSchema.safeExtend({ workItem: owner }),
  FrontlineRunStateSchema.safeExtend({ workItem: owner, outcome: z.literal("pending") }),
  ReviewSuspensionStateSchema.safeExtend({ workItem: owner }),
]);
export type ReviewInFlightState = z.infer<typeof ReviewInFlightStateSchema>;
export const ReviewInFlightRecordSchema = z.strictObject({ schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-in-flight/v1"), operationId: lane.operationId,
  version: z.number().int().positive(), state: ReviewInFlightStateSchema });
export type ReviewInFlightRecord = z.infer<typeof ReviewInFlightRecordSchema>;

/** Remove ended and approval-only fields from one pending lane attempt. */
export function projectReviewInFlightAttempt(value: z.infer<typeof LaneAttemptSchema>): ReviewInFlightAttempt {
  const attempt = LaneAttemptSchema.parse(value);
  if (attempt.outcome !== "pending" || attempt.terminalProducer) throw new Error("Only pending attempts belong in execution state.");
  return ReviewInFlightAttemptSchema.strip().parse({ ...attempt,
    ...(attempt.hosted === undefined ? {} : { hosted: HostedInFlightBindingSchema.strip().parse(attempt.hosted) }) });
}

/** Compose the existing pending attempt interface from execution-only fields. */
function composeReviewInFlightAttempt(value: ReviewInFlightAttempt): z.infer<typeof LaneAttemptSchema> {
  return LaneAttemptSchema.parse({ ...value, outcome: "pending", terminalProducer: false,
    ...(value.hosted === undefined ? {} : { hosted: { ...value.hosted, requestFailureReason: null,
      dispositionSetId: null, dispositionSetLineage: [], settledFindingIds: [], settlementEvidence: [] } }) });
}

/** Project an existing operation into the native working-state contract. */
export function projectReviewInFlightState(state: ReviewOperationState): ReviewInFlightState {
  const value = ReviewOperationStateSchema.parse(state);
  if (value.kind !== "lane-progress") return ReviewInFlightStateSchema.parse(value);
  return ReviewInFlightLaneSchema.strip().parse({ ...value, attempts: value.attempts.map(projectReviewInFlightAttempt) });
}

/** Reconstruct the existing operation interface without introducing durable lane facts. */
export function composeReviewInFlightState(state: ReviewInFlightState): ReviewOperationState {
  return ReviewOperationStateSchema.parse(state.kind === "lane-progress"
    ? { ...state, completedPasses: 0, attempts: state.attempts.map(composeReviewInFlightAttempt) } : state);
}
