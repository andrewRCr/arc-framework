/** Canonical channel-neutral disposition proposals and approval records. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { FindingDispositionSchema, ReviewSeveritySchema } from "./review-primitives.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const NonEmptyTextSchema = z.string().trim().min(1).max(4096);
const ReferenceSchema = z.string().trim().min(1);

export const DispositionReportItemSchema = z.strictObject({
  findingId: z.string().trim().min(1).max(512),
  sourceIdentity: IdentifierSchema,
  locus: z.string().trim().min(1).max(2048),
  sourceVerification: z.enum(["verified", "not-supported"]),
  verificationRefs: z.array(ReferenceSchema).min(1),
  severity: ReviewSeveritySchema,
  nit: z.literal(true).optional(),
  disposition: FindingDispositionSchema,
  gating: z.enum(["blocking", "record-only"]),
  rationale: NonEmptyTextSchema,
  recommendation: NonEmptyTextSchema,
  openQuestions: z.array(NonEmptyTextSchema),
}).superRefine((item, context) => {
  if (item.nit === true && item.severity !== "minor") {
    context.addIssue({ code: "custom", message: "nit is valid only for minor findings", path: ["nit"] });
  }
  if (item.nit === true && item.gating !== "record-only") {
    context.addIssue({ code: "custom", message: "nit findings are record-only", path: ["gating"] });
  }
  if (item.sourceVerification === "not-supported" && item.disposition !== "reject") {
    context.addIssue({
      code: "custom",
      message: "a finding not supported by source must be rejected",
      path: ["disposition"],
    });
  }
});
export type DispositionReportItem = z.infer<typeof DispositionReportItemSchema>;

const DispositionSetFieldsSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  targetId: CanonicalDigestSchema,
  policyVersion: CanonicalDigestSchema,
  rubricVersion: IdentifierSchema,
  rubricDigest: CanonicalDigestSchema,
  proposedBy: IdentifierSchema,
  findings: z.array(DispositionReportItemSchema).min(1),
});

export const DispositionSetPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.disposition-set/v2"),
  ...DispositionSetFieldsSchema.shape,
});
export type DispositionSetPreimage = z.infer<typeof DispositionSetPreimageSchema>;

export const DispositionSetSchema = z.strictObject({
  ...DispositionSetFieldsSchema.shape,
  dispositionSetId: CanonicalDigestSchema,
});
export type DispositionSet = z.infer<typeof DispositionSetSchema>;

export const DispositionApprovalSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  targetId: CanonicalDigestSchema,
  dispositionSetId: CanonicalDigestSchema,
  approvedBy: IdentifierSchema,
  approvedAt: z.iso.datetime({ offset: true }),
});
export type DispositionApproval = z.infer<typeof DispositionApprovalSchema>;

/** Register proposal and approval records at the review-disposition owner. */
export function registerDispositionRecordSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(DispositionReportItemSchema, {
    id: "disposition-report-item",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(DispositionSetPreimageSchema, {
    id: "disposition-set-preimage",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(DispositionSetSchema, {
    id: "disposition-set",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(DispositionApprovalSchema, {
    id: "disposition-approval",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
