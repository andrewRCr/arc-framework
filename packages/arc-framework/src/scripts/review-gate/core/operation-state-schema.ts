/** Registered non-evidentiary state for resumable review operations. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const OperationEnvelopeShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-operation/v1"),
  operationId: IdentifierSchema,
  updatedAt: z.iso.datetime({ offset: true }),
};

export const FrontlineRunStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("frontline-run"),
  targetId: CanonicalDigestSchema,
  sourceIdentity: IdentifierSchema,
  generation: z.number().int().nonnegative(),
  outcome: z.enum(["pending", "clean", "findings", "failed", "unavailable"]),
  passCount: z.number().int().nonnegative(),
  policyVersion: CanonicalDigestSchema,
  sourceBindingId: CanonicalDigestSchema,
});
export type FrontlineRunState = z.infer<typeof FrontlineRunStateSchema>;

export const ReviewSuspensionStateSchema = z.strictObject({
  ...OperationEnvelopeShape,
  kind: z.literal("review-suspension"),
  vehicle: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("work-unit"), identity: IdentifierSchema }),
    z.strictObject({ kind: z.literal("errand"), identity: IdentifierSchema }),
  ]),
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

export const ReviewOperationStateSchema = z.discriminatedUnion("kind", [
  FrontlineRunStateSchema,
  ReviewSuspensionStateSchema,
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
  registry.register(ReviewOperationStateSchema, {
    id: "review-operation-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
