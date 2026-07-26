/** Runtime schemas for normalized review findings and their settlement records. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { DispositionApprovalSchema } from "./disposition-records.js";
import { FixAuthorizationConsumptionSchema } from "./fix-authorization-records.js";
import {
  FindingClassificationSchema,
  FindingDispositionSchema,
  ReviewSeveritySchema,
} from "./review-primitives.js";

const EvidenceReferenceSchema = z.string().trim().min(1);
const FindingIdentitySchema = z.string().trim().min(1).max(512);
const FindingLocusSchema = z.string().trim().min(1).max(2048);
const ReviewCanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const ReviewGateV2SemanticsSchema = z.literal("review-gate/v2");
const ReviewIdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);

export const NormalizedReviewFindingSchema = z.strictObject({
  findingId: FindingIdentitySchema,
  severity: ReviewSeveritySchema,
  nit: z.literal(true).optional(),
  locus: FindingLocusSchema,
  evidenceUrlOrId: EvidenceReferenceSchema,
  recursFindingId: FindingIdentitySchema.optional(),
}).superRefine((finding, context) => {
  const classification = FindingClassificationSchema.safeParse({
    severity: finding.severity,
    ...(finding.nit === undefined ? {} : { nit: finding.nit }),
  });
  if (!classification.success) {
    context.addIssue({ code: "custom", message: "nit is valid only for minor findings", path: ["nit"] });
  }
  if (finding.recursFindingId === finding.findingId) {
    context.addIssue({ code: "custom", message: "a finding cannot recur from itself", path: ["recursFindingId"] });
  }
});
export type NormalizedReviewFinding = z.infer<typeof NormalizedReviewFindingSchema>;

export const ProviderFindingSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type ProviderFindingSeverity = z.infer<typeof ProviderFindingSeveritySchema>;

/**
 * Detect an explicit provider polish marker.
 *
 * A bracketed tag counts anywhere; a bare term counts only where a line presents it as a marker, so
 * prose that merely mentions the term — including a negation — is not treated as a classification.
 *
 * @param body - Provider-authored comment body
 * @returns True when the body carries an explicit polish marker
 */
export function hasExplicitPurePolishMarker(body: string): boolean {
  return /\[nit\]/iu.test(body)
    || /(?:^|\n)[^\w\n]*(?:(?:nitpick|pure[- ]polish)\s*(?::|[-—])|(?:nitpick|pure[- ]polish)(?:\s+comments?\s*(?:\(\d+\))?)?\s*(?=\r?(?:\n|$)))/iu.test(body);
}

/**
 * Normalize provider-native severity only at an adapter boundary.
 *
 * Polish is retained only where the normalized severity admits it, so contradictory provider input
 * yields the more severe classification instead of an unrepresentable one.
 *
 * @param providerSeverity - Provider-native severity label
 * @param purePolish - Whether the provider marked the finding as pure polish
 * @returns A representable classification
 */
export function normalizeProviderFindingClassification(
  providerSeverity: ProviderFindingSeverity,
  purePolish: boolean,
): z.infer<typeof FindingClassificationSchema> {
  const severity = providerSeverity === "critical"
    ? "blocker"
    : providerSeverity === "high" || providerSeverity === "medium"
      ? "major"
      : "minor";
  return FindingClassificationSchema.parse({
    severity,
    ...(purePolish && severity === "minor" ? { nit: true } : {}),
  });
}

export const FindingSettlementV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: ReviewGateV2SemanticsSchema,
  targetId: ReviewCanonicalDigestSchema,
  dispositionSetId: ReviewCanonicalDigestSchema,
  approval: DispositionApprovalSchema,
  findingId: FindingIdentitySchema,
  sourceIdentity: ReviewIdentifierSchema,
  severity: ReviewSeveritySchema,
  nit: z.literal(true).optional(),
  disposition: FindingDispositionSchema,
  rationale: z.string().trim().min(1).max(4096),
  settledBy: ReviewIdentifierSchema,
  settledAt: z.iso.datetime({ offset: true }),
  fixTargetId: ReviewCanonicalDigestSchema.nullable(),
  fixConsumption: FixAuthorizationConsumptionSchema.nullable(),
  verificationRefs: z.array(EvidenceReferenceSchema),
}).superRefine((settlement, context) => {
  const classification = FindingClassificationSchema.safeParse({
    severity: settlement.severity,
    ...(settlement.nit === undefined ? {} : { nit: settlement.nit }),
  });
  if (!classification.success) {
    context.addIssue({ code: "custom", message: "nit is valid only for minor findings", path: ["nit"] });
  }
  const fixesTarget = settlement.fixTargetId !== null;
  const consumesAuthorization = settlement.fixConsumption !== null;
  if ((settlement.disposition === "fix") !== fixesTarget
    || (settlement.disposition === "fix") !== consumesAuthorization) {
    context.addIssue({
      code: "custom",
      message: "only fix dispositions bind a resulting target",
      path: ["fixTargetId"],
    });
  }
  if (settlement.disposition === "fix" && settlement.verificationRefs.length === 0) {
    context.addIssue({
      code: "custom",
      message: "fix dispositions require verification evidence",
      path: ["verificationRefs"],
    });
  }
  if (settlement.fixConsumption !== null
    && (settlement.fixConsumption.oldTargetId !== settlement.targetId
      || settlement.fixConsumption.newTargetId !== settlement.fixTargetId
      || settlement.fixConsumption.dispositionSetId !== settlement.dispositionSetId
      || settlement.fixConsumption.appliedBy !== settlement.settledBy
      || settlement.fixConsumption.verificationRefs.length !== settlement.verificationRefs.length
      || settlement.fixConsumption.verificationRefs.some(
        (reference, index) => reference !== settlement.verificationRefs[index],
      ))) {
    context.addIssue({ code: "custom", message: "fix consumption must bind the exact settlement", path: ["fixConsumption"] });
  }
});
export type FindingSettlementV2 = z.infer<typeof FindingSettlementV2Schema>;

/** Register finding-domain records at their semantic owner. */
export function registerFindingRecordSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(NormalizedReviewFindingSchema, {
    id: "normalized-review-finding",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(FindingSettlementV2Schema, {
    id: "finding-settlement",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
