/** Read-only required-check qualification for one caller-bound delivery member. */

import { z } from "zod";

import { DeliveryReviewMemberVehicleSchema } from "../../lib/delivery/review-vehicle.js";
import {
  observeRequiredChecks,
  RequiredCheckSchema,
  RequiredChecksObservationInputSchema,
  type RequiredChecksObservationDependencies,
} from "./checks-await.js";
import { SpineRemedySchema } from "../integration/spine-refusal.js";

export const DeliveryMemberChecksInputSchema = RequiredChecksObservationInputSchema.extend({
  schemaVersion: z.literal(1),
  member: DeliveryReviewMemberVehicleSchema,
}).superRefine((input, context) => {
  if (input.member.head !== input.headSha) {
    context.addIssue({
      code: "custom",
      path: ["member", "head"],
      message: "delivery member head must match the observed exact head",
    });
  }
});
export type DeliveryMemberChecksInput = z.infer<typeof DeliveryMemberChecksInputSchema>;

const DeliveryMemberChecksBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("delivery-member-checks-observe"),
  repository: z.string().trim().min(1),
  pullRequest: z.number().int().positive(),
  headSha: DeliveryReviewMemberVehicleSchema.shape.head,
  member: DeliveryReviewMemberVehicleSchema,
};

export const DeliveryMemberChecksResultSchema = z.union([
  z.strictObject({
    ...DeliveryMemberChecksBaseShape,
    state: z.literal("qualified"),
    nextAction: z.literal("complete"),
    qualification: z.enum(["green", "not-required"]),
    checks: z.array(RequiredCheckSchema),
  }),
  z.strictObject({
    ...DeliveryMemberChecksBaseShape,
    state: z.literal("pending"),
    nextAction: z.literal("retry"),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
  }),
  z.strictObject({
    ...DeliveryMemberChecksBaseShape,
    state: z.literal("failed"),
    nextAction: z.literal("stop"),
    checks: z.array(RequiredCheckSchema),
  }),
  z.strictObject({
    ...DeliveryMemberChecksBaseShape,
    state: z.literal("stale"),
    nextAction: z.literal("refresh-target"),
    actualHeadSha: DeliveryReviewMemberVehicleSchema.shape.head,
  }),
  z.strictObject({
    ...DeliveryMemberChecksBaseShape,
    state: z.literal("unavailable"),
    nextAction: z.literal("retry"),
    cause: z.enum(["repository-mismatch", "provider", "aborted", "deadline"]),
    detail: z.string().trim().min(1),
    checks: z.array(RequiredCheckSchema),
    diagnosticFailures: z.array(RequiredCheckSchema),
    actualRepository: z.string().trim().min(1).optional(),
  }),
]).superRefine((result, context) => {
  if (result.member.head !== result.headSha) {
    context.addIssue({
      code: "custom",
      path: ["member", "head"],
      message: "delivery member head must match the observed exact head",
    });
  }
});
export type DeliveryMemberChecksResult = z.infer<typeof DeliveryMemberChecksResultSchema>;

export const DeliveryMemberChecksCommandResultSchema = z.union([
  DeliveryMemberChecksResultSchema,
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("delivery-member-checks-observe"),
    repository: z.string().trim().min(1).nullable(),
    pullRequest: z.number().int().positive().nullable(),
    headSha: DeliveryReviewMemberVehicleSchema.shape.head.nullable(),
    member: DeliveryReviewMemberVehicleSchema.nullable(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "checks-unavailable"]),
    detail: z.string().trim().min(1),
    remedy: SpineRemedySchema,
  }),
]);
export type DeliveryMemberChecksCommandResult = z.infer<typeof DeliveryMemberChecksCommandResultSchema>;

/**
 * Qualify required checks once for one caller-bound delivery member and exact change-request head.
 *
 * @param input - Caller-held delivery-member and change-request coordinates.
 * @param dependencies - Exact-head required-check observation boundary.
 * @returns One member-bound qualification without scheduling or mutating CI.
 */
export async function observeDeliveryMemberChecks(
  input: DeliveryMemberChecksInput,
  dependencies: RequiredChecksObservationDependencies,
): Promise<DeliveryMemberChecksResult> {
  const parsed = DeliveryMemberChecksInputSchema.parse(input);
  const observation = await observeRequiredChecks(parsed, dependencies);
  const base = {
    schemaVersion: 1 as const,
    mode: "delivery-member-checks-observe" as const,
    repository: parsed.repository,
    pullRequest: parsed.pullRequest,
    headSha: parsed.headSha,
    member: parsed.member,
  };
  switch (observation.state) {
    case "not-required":
    case "green":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "qualified",
        nextAction: "complete",
        qualification: observation.state,
        checks: observation.checks,
      });
    case "pending":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "pending",
        nextAction: "retry",
        checks: observation.checks,
        diagnosticFailures: observation.diagnosticFailures,
      });
    case "failed":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "failed",
        nextAction: "stop",
        checks: observation.checks,
      });
    case "stale-target":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "stale",
        nextAction: "refresh-target",
        actualHeadSha: observation.actualHeadSha,
      });
    case "target-mismatch":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "unavailable",
        nextAction: "retry",
        cause: "repository-mismatch",
        detail: `Required-check evidence resolved from ${observation.actualRepository} instead of ${parsed.repository}.`,
        checks: [],
        diagnosticFailures: [],
        actualRepository: observation.actualRepository,
      });
    case "unavailable":
      return DeliveryMemberChecksResultSchema.parse({
        ...base,
        state: "unavailable",
        nextAction: "retry",
        cause: observation.cause,
        detail: observation.detail,
        checks: observation.checks,
        diagnosticFailures: observation.diagnosticFailures,
      });
  }
}
