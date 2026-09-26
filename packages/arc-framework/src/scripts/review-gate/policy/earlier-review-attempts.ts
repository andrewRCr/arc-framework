/** Bounded, storage-neutral query over complete review-operation snapshots. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../../lib/delivery/review-vehicle.js";
import type { ReviewOperationStateSnapshot } from "../core/ports.js";
import {
  GitObjectIdSchema,
  ReviewIdentifierSchema,
  ReviewRequirementV2Schema,
  ReviewTargetSchema,
} from "../core/gate-contract-v2-schema.js";
import { HostedReviewCoverageSchema, HostedTargetSchema } from "../hosted/request.js";
import { HostedFindingsSchema } from "../hosted/await.js";
import {
  LaneSubjectLineageSchema,
  laneSubjectLineageId,
} from "../core/lane-admission.js";
import { ReviewScopeModeSchema } from "../core/review-primitives.js";

const SourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const RepositorySchema = z.string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
  .transform((value) => value.toLowerCase());

export const MAX_EARLIER_REVIEW_ATTEMPT_CANDIDATES = 100;

export const EarlierReviewAttemptQuerySchema = z.strictObject({
  schemaVersion: z.literal(1),
  repositoryId: ReviewIdentifierSchema,
  repository: RepositorySchema,
  pullRequest: z.int().positive(),
  currentHead: GitObjectIdSchema,
  /** Exact current diff base distinguishes a retargeted review at the same head. */
  currentBase: GitObjectIdSchema.optional(),
  lane: z.enum(["frontline", "standard"]),
  sourceId: SourceIdSchema,
  lineage: LaneSubjectLineageSchema,
  currentVehicle: DeliveryReviewMemberVehicleSchema.optional(),
}).superRefine((selector, context) => {
  if (selector.currentVehicle !== undefined && selector.currentVehicle.head !== selector.currentHead) {
    context.addIssue({
      code: "custom",
      path: ["currentVehicle", "head"],
      message: "current delivery vehicle must identify the current review head",
    });
  }
});
export type EarlierReviewAttemptQuery = z.infer<typeof EarlierReviewAttemptQuerySchema>;

const EarlierReviewAttemptCandidateSchema = z.strictObject({
  operationId: ReviewIdentifierSchema,
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime({ offset: true }),
  attemptId: ReviewIdentifierSchema,
  logicalPass: z.int().positive(),
  sourceId: SourceIdSchema,
  sourceKind: z.enum(["hosted", "local"]),
  outcome: z.string().min(1),
  requestedCoverage: HostedReviewCoverageSchema,
  effectiveCoverage: HostedReviewCoverageSchema.nullable(),
  scopeMode: ReviewScopeModeSchema,
  chunkSeriesComplete: z.boolean().optional(),
  priorHead: GitObjectIdSchema,
  target: HostedTargetSchema,
  priorVehicle: DeliveryReviewMemberVehicleSchema.optional(),
  reviewTarget: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema.optional(),
  findings: HostedFindingsSchema,
});
export type EarlierReviewAttemptCandidate = z.infer<typeof EarlierReviewAttemptCandidateSchema>;

export const EarlierReviewAttemptQueryResultSchema = z.union([
  z.strictObject({
    status: z.literal("complete"),
    candidates: z.array(EarlierReviewAttemptCandidateSchema).min(1)
      .max(MAX_EARLIER_REVIEW_ATTEMPT_CANDIDATES),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.enum([
      "operation-snapshot-incomplete",
      "operation-snapshot-unavailable",
      "no-matching-attempt",
      "candidate-set-unbounded",
    ]),
    detail: z.string().min(1),
  }),
]);
export type EarlierReviewAttemptQueryResult = z.infer<typeof EarlierReviewAttemptQueryResultSchema>;

function sameVehicleIdentity(
  current: z.infer<typeof DeliveryReviewMemberVehicleSchema> | undefined,
  prior: z.infer<typeof DeliveryReviewMemberVehicleSchema> | undefined,
): boolean {
  if (current === undefined || prior === undefined) return current === prior;
  return current.planId === prior.planId
    && current.deliverableId === prior.deliverableId
    && current.workUnitId === prior.workUnitId;
}

/** Return all exact earlier attempts, or stop evidence that cannot be mistaken for absence. */
export function queryEarlierReviewAttempts(
  selectorInput: EarlierReviewAttemptQuery,
  snapshot: ReviewOperationStateSnapshot,
): EarlierReviewAttemptQueryResult {
  const selector = EarlierReviewAttemptQuerySchema.parse(selectorInput);
  if (snapshot.status !== "complete") {
    return {
      status: "unavailable",
      reason: snapshot.status === "incomplete"
        ? "operation-snapshot-incomplete"
        : "operation-snapshot-unavailable",
      detail: snapshot.reason,
    };
  }
  const candidates: EarlierReviewAttemptCandidate[] = [];
  for (const record of snapshot.records) {
    const state = record.state;
    if (state.kind !== "lane-progress"
      || state.lane !== selector.lane
      || state.repositoryId !== selector.repositoryId
      || laneSubjectLineageId(state.lineage) !== laneSubjectLineageId(selector.lineage)) continue;
    for (const attempt of state.attempts) {
      if (attempt.headSha === selector.currentHead
        && (selector.currentBase === undefined
          || (attempt.hosted?.reviewTarget.diffBaseSha
            ?? attempt.local?.target.diffBaseSha) === selector.currentBase)) continue;
      const hosted = attempt.hosted;
      if (attempt.sourceId !== selector.sourceId) continue;
      if (hosted !== undefined
        && attempt.changeRequestId === `pull/${String(selector.pullRequest)}`
        && hosted.target.repository.toLowerCase() === selector.repository
        && hosted.target.pullRequest === selector.pullRequest
        && hosted.target.headSha === attempt.headSha
        && hosted.reviewTarget.repositoryId === selector.repositoryId
        && hosted.reviewTarget.headSha === attempt.headSha
        && sameVehicleIdentity(selector.currentVehicle, hosted.vehicle)) {
        candidates.push(EarlierReviewAttemptCandidateSchema.parse({
          operationId: state.operationId,
          version: record.version,
          updatedAt: state.updatedAt,
          attemptId: attempt.attemptId,
          logicalPass: attempt.logicalPass,
          sourceId: attempt.sourceId,
          sourceKind: "hosted",
          outcome: attempt.outcome,
          requestedCoverage: hosted.requestedCoverage,
          effectiveCoverage: hosted.effectiveCoverage,
          scopeMode: "whole-target",
          ...(attempt.chunkSeriesComplete === undefined
            ? {}
            : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
          priorHead: attempt.headSha,
          target: hosted.target,
          ...(hosted.vehicle === undefined ? {} : { priorVehicle: hosted.vehicle }),
          reviewTarget: hosted.reviewTarget,
          requirement: hosted.requirement,
          findings: hosted.sealedResult?.findings ?? [],
        }));
        continue;
      }
      const local = attempt.local;
      if (local === undefined
        || local.deliveryAdmission === undefined
        || attempt.changeRequestId !== null
        || selector.currentVehicle === undefined
        || local.vehicle.kind !== "delivery-member"
        || !sameVehicleIdentity(selector.currentVehicle, local.deliveryAdmission.vehicle)
        || local.deliveryAdmission.target.repository.toLowerCase() !== selector.repository
        || local.deliveryAdmission.target.pullRequest !== selector.pullRequest
        || local.target.kind !== "delivery-member"
        || local.target.repositoryId !== selector.repositoryId
        || local.target.headSha !== attempt.headSha) continue;
      candidates.push(EarlierReviewAttemptCandidateSchema.parse({
        operationId: state.operationId,
        version: record.version,
        updatedAt: state.updatedAt,
        attemptId: attempt.attemptId,
        logicalPass: attempt.logicalPass,
        sourceId: attempt.sourceId,
        sourceKind: "local",
        outcome: attempt.outcome,
        requestedCoverage: local.requestedCoverage,
        effectiveCoverage: local.effectiveCoverage,
        scopeMode: local.scopeMode,
        ...(attempt.chunkSeriesComplete === undefined
          ? {}
          : { chunkSeriesComplete: attempt.chunkSeriesComplete }),
        priorHead: attempt.headSha,
        target: local.deliveryAdmission.target,
        priorVehicle: local.deliveryAdmission.vehicle,
        reviewTarget: local.target,
        findings: [],
      }));
    }
  }
  candidates.sort((left, right) => (
    left.updatedAt.localeCompare(right.updatedAt)
      || left.operationId.localeCompare(right.operationId)
      || left.attemptId.localeCompare(right.attemptId)
  ));
  if (candidates.length === 0) {
    return {
      status: "unavailable",
      reason: "no-matching-attempt",
      detail: "The complete operation snapshot contains no exact earlier review attempt.",
    };
  }
  if (candidates.length > MAX_EARLIER_REVIEW_ATTEMPT_CANDIDATES) {
    return {
      status: "unavailable",
      reason: "candidate-set-unbounded",
      detail: "The exact earlier review attempt set exceeds the query bound.",
    };
  }
  return EarlierReviewAttemptQueryResultSchema.parse({ status: "complete", candidates });
}
