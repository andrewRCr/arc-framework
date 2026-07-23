/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  validateReviewRequest,
  validateReviewRequirement,
  validateReviewTarget,
} from "./gate-contract-v2.js";
import {
  ReviewRequestV2Schema,
  ReviewRequirementV2Schema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";
import { LocalAttestationBindingSchema } from "./local-carrier.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OperationEnvelopeShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-operation/v1"),
  operationId: IdentifierSchema,
  updatedAt: z.iso.datetime({ offset: true }),
};
const ReviewVehicleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), identity: IdentifierSchema }),
  z.strictObject({ kind: z.literal("errand"), identity: IdentifierSchema }),
]);

export const FrontlineRunStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("frontline-run"),
  targetId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
  outcome: z.enum([
    "pending",
    "clean",
    "findings",
    "failed",
    "unavailable",
    "timed-out",
    "stale-target",
    "pass-cap-exhausted",
  ]),
  passCount: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  sourceBindingId: CanonicalDigestSchema,
});
export type FrontlineRunState = z.infer<typeof FrontlineRunStateSchema>;

export const ReviewSuspensionStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("review-suspension"),
  vehicle: ReviewVehicleSchema,
  repositoryId: IdentifierSchema,
  changeRequestId: IdentifierSchema.nullable(),
  targetId: CanonicalDigestSchema,
  requestId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  rubricVersion: IdentifierSchema,
  rubricDigest: CanonicalDigestSchema,
  deadlineAt: z.iso.datetime({ offset: true }),
  wakeupToken: CanonicalDigestSchema,
});
export type ReviewSuspensionState = z.infer<typeof ReviewSuspensionStateSchema>;

export const LocalReviewStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("local-review"),
  vehicle: ReviewVehicleSchema,
  repositoryId: IdentifierSchema,
  targetId: CanonicalDigestSchema,
  requestId: CanonicalDigestSchema,
  policyVersion: CanonicalDigestSchema,
  policyBindingDigest: CanonicalDigestSchema,
  attestationRuntimeKind: IdentifierSchema,
  sourceRef: z.string().trim().min(1),
  sourceDigest: CanonicalDigestSchema,
  guidanceDigest: CanonicalDigestSchema,
  target: ReviewTargetSchema,
  requirement: ReviewRequirementV2Schema,
  request: ReviewRequestV2Schema,
  attestation: LocalAttestationBindingSchema,
  cleanupTtlMs: z.number().int().positive(),
}).superRefine((state, context) => {
  try {
    const target = validateReviewTarget(state.target);
    const requirement = validateReviewRequirement(target, state.requirement);
    const request = validateReviewRequest(target, state.request);
    if (state.repositoryId !== target.repositoryId || state.targetId !== target.targetId) {
      context.addIssue({ code: "custom", message: "operation target snapshot mismatch", path: ["target"] });
    }
    if (state.policyVersion !== requirement.policyVersion) {
      context.addIssue({ code: "custom", message: "operation requirement snapshot mismatch", path: ["requirement"] });
    }
    if (state.requestId !== request.requestId
      || request.requirementId !== requirement.requirementId) {
      context.addIssue({ code: "custom", message: "operation request snapshot mismatch", path: ["request"] });
    }
    if (state.attestation.evaluatorIdentity !== request.evaluatorIdentity) {
      context.addIssue({
        code: "custom",
        message: "operation attestation snapshot mismatch",
        path: ["attestation"],
      });
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "invalid local admission snapshot",
      path: ["target"],
    });
  }
});
export type LocalReviewState = z.infer<typeof LocalReviewStateSchema>;

export const ReviewOperationStateSchema = z.discriminatedUnion("kind", [
  FrontlineRunStateSchema,
  ReviewSuspensionStateSchema,
  LocalReviewStateSchema,
]);
export type ReviewOperationState = z.infer<typeof ReviewOperationStateSchema>;

/** Register resumable operation records separately from gate evidence. */
export function registerReviewOperationStateSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(FrontlineRunStateSchema, {
    id: "frontline-run-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewSuspensionStateSchema, {
    id: "review-suspension-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(LocalReviewStateSchema, {
    id: "local-review-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewOperationStateSchema, {
    id: "review-operation-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
