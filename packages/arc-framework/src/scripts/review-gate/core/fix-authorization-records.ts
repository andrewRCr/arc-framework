/** Zod authority for single-use review-fix authorization records. */

import { z } from "zod";

import { sortByCanonicalBytes, type KernelRegistry } from "../../../lib/kernel/index.js";
import { CandidateVerificationApplicabilitySchema } from
  "../../../lib/work-unit/candidate-attestation.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const FindingIdentitySchema = z.string().trim().min(1).max(512);
const EvidenceReferenceSchema = z.string().trim().min(1);

export const FixAuthorizationFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  oldTargetId: CanonicalDigestSchema,
  oldHeadSha: GitObjectIdSchema,
  dispositionSetId: CanonicalDigestSchema,
  authorizedFindingIds: z.array(FindingIdentitySchema).min(1),
  approvedVerification: CandidateVerificationApplicabilitySchema,
  authorizedBy: IdentifierSchema,
  authorizedAt: z.iso.datetime({ offset: true }),
});

export const FixAuthorizationPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.fix-authorization/v2"),
  ...FixAuthorizationFieldsSchema.shape,
});
export type FixAuthorizationPreimage = z.infer<typeof FixAuthorizationPreimageSchema>;

export const FixAuthorizationSchema = z.strictObject({
  ...FixAuthorizationFieldsSchema.shape,
  fixAuthorizationId: CanonicalDigestSchema,
}).superRefine((authorization, context) => {
  const normalized = sortByCanonicalBytes(authorization.authorizedFindingIds);
  if (new Set(normalized).size !== normalized.length
    || normalized.some((findingId, index) => findingId !== authorization.authorizedFindingIds[index])) {
    context.addIssue({
      code: "custom",
      message: "authorized finding identities must be sorted and unique",
      path: ["authorizedFindingIds"],
    });
  }
});
export type FixAuthorization = z.infer<typeof FixAuthorizationSchema>;

export const FixAuthorizationConsumptionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  fixAuthorizationId: CanonicalDigestSchema,
  dispositionSetId: CanonicalDigestSchema,
  oldTargetId: CanonicalDigestSchema,
  newTargetId: CanonicalDigestSchema,
  oldHeadSha: GitObjectIdSchema,
  newHeadSha: GitObjectIdSchema,
  appliedBy: IdentifierSchema,
  consumedAt: z.iso.datetime({ offset: true }),
  verificationRefs: z.array(EvidenceReferenceSchema).min(1),
}).superRefine((consumption, context) => {
  if (consumption.oldTargetId === consumption.newTargetId) {
    context.addIssue({ code: "custom", message: "fix consumption must change the exact target", path: ["newTargetId"] });
  }
  if (consumption.oldHeadSha === consumption.newHeadSha) {
    context.addIssue({ code: "custom", message: "fix consumption must change the exact head", path: ["newHeadSha"] });
  }
});
export type FixAuthorizationConsumption = z.infer<typeof FixAuthorizationConsumptionSchema>;

/** Register review-fix authorization records at their semantic owner. */
export function registerFixAuthorizationSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(FixAuthorizationPreimageSchema, {
    id: "fix-authorization-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(FixAuthorizationSchema, {
    id: "fix-authorization",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(FixAuthorizationConsumptionSchema, {
    id: "fix-authorization-consumption",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
