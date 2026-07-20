/** Zod authority for forward-only review-gate targets, requests, and identity preimages. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";

export const ReviewGateV2SemanticsSchema = z.literal("review-gate/v2");
export type ReviewGateV2Semantics = z.infer<typeof ReviewGateV2SemanticsSchema>;

export const ReviewCanonicalDigestSchema = z.string()
  .regex(/^sha256:[0-9a-f]{64}$/u);
export type ReviewCanonicalDigest = z.infer<typeof ReviewCanonicalDigestSchema>;

export const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
export type GitObjectId = z.infer<typeof GitObjectIdSchema>;

const ReviewIdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);

export const ReviewTargetIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.target-id/v2"),
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  kind: z.literal("change-set"),
  repositoryId: ReviewIdentifierSchema,
  baseRef: ReviewIdentifierSchema,
  diffBaseSha: GitObjectIdSchema,
  diffBaseTree: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
});
export type ReviewTargetIdPreimage = z.infer<typeof ReviewTargetIdPreimageSchema>;

export const ReviewTargetInputSchema = ReviewTargetIdPreimageSchema.omit({ domain: true });
export type ReviewTargetInput = z.infer<typeof ReviewTargetInputSchema>;

export const ReviewTargetSchema = ReviewTargetInputSchema.extend({
  targetId: ReviewCanonicalDigestSchema,
});
export type ReviewTarget = z.infer<typeof ReviewTargetSchema>;

export const ReviewCarrierSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("change-request"),
    adapterId: ReviewIdentifierSchema,
    changeRequestId: ReviewIdentifierSchema,
  }),
  z.strictObject({
    kind: z.literal("local-change-set"),
    adapterId: ReviewIdentifierSchema,
    changeRequestId: z.null(),
  }),
]);
export type ReviewCarrier = z.infer<typeof ReviewCarrierSchema>;

const ReviewRequestFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  repositoryId: ReviewIdentifierSchema,
  targetId: ReviewCanonicalDigestSchema,
  requirementId: ReviewCanonicalDigestSchema,
  carrier: ReviewCarrierSchema,
  authorIdentity: ReviewIdentifierSchema,
  evaluatorIdentity: ReviewIdentifierSchema,
  generation: z.number().int().nonnegative(),
  requestMechanism: ReviewIdentifierSchema,
});

export const ReviewRequestIdPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.request-id/v2"),
  ...ReviewRequestFieldsSchema.shape,
}).refine((request) => request.authorIdentity !== request.evaluatorIdentity, {
  message: "author and evaluator identities must differ",
});
export type ReviewRequestIdPreimage = z.infer<typeof ReviewRequestIdPreimageSchema>;

export const ReviewRequestInputSchema = ReviewRequestFieldsSchema.refine(
  (request) => request.authorIdentity !== request.evaluatorIdentity,
  { message: "author and evaluator identities must differ" },
);
export type ReviewRequestInput = z.infer<typeof ReviewRequestInputSchema>;

export const ReviewRequestV2Schema = z.strictObject({
  ...ReviewRequestFieldsSchema.shape,
  requestId: ReviewCanonicalDigestSchema,
}).refine((request) => request.authorIdentity !== request.evaluatorIdentity, {
  message: "author and evaluator identities must differ",
});
export type ReviewRequestV2 = z.infer<typeof ReviewRequestV2Schema>;

/** Register forward gate-contract target schemas with a caller-owned registry. */
export function registerReviewGateV2Schemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ReviewTargetIdPreimageSchema, {
    id: "review-target-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewTargetSchema, {
    id: "review-target",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequestIdPreimageSchema, {
    id: "review-request-id-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewRequestV2Schema, {
    id: "review-request",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
