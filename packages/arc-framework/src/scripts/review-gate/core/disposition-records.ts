/** Canonical channel-neutral disposition proposals and approval records. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import type { CanonicalDigest, KernelRegistry } from "../../../lib/kernel/index.js";
import { CandidateVerificationApplicabilitySchema } from
  "../../../lib/work-unit/candidate-attestation.js";
import { ReviewFindingIdentitySchema } from "./finding-records.js";
import { FindingDispositionSchema, ReviewSeveritySchema } from "./review-primitives.js";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const NonEmptyTextSchema = z.string().trim().min(1).max(4096);
const ReferenceSchema = z.string().trim().min(1);

const DispositionReportItemFieldsSchema = z.strictObject({
  findingId: ReviewFindingIdentitySchema,
  sourceIdentity: IdentifierSchema,
  locus: z.string().trim().min(1).max(2048),
  verificationRefs: z.array(ReferenceSchema).min(1),
  reportedSeverity: ReviewSeveritySchema,
  reportedNit: z.literal(true).optional(),
  rationale: NonEmptyTextSchema,
  recommendation: NonEmptyTextSchema,
  openQuestions: z.array(NonEmptyTextSchema),
});

const VerifiedDispositionSchema = DispositionReportItemFieldsSchema.extend({
  sourceVerification: z.literal("verified"),
  verifiedSeverity: ReviewSeveritySchema,
  verifiedNit: z.literal(true).optional(),
  disposition: FindingDispositionSchema,
  gating: z.enum(["blocking", "record-only"]),
});

const UnsupportedDispositionSchema = DispositionReportItemFieldsSchema.extend({
  sourceVerification: z.literal("not-supported"),
  verifiedSeverity: z.null(),
  disposition: z.literal("reject"),
  gating: z.literal("record-only"),
});

export const DispositionReportItemSchema = z.union([
  VerifiedDispositionSchema,
  UnsupportedDispositionSchema,
]).superRefine((item, context) => {
  if (item.reportedNit === true && item.reportedSeverity !== "minor") {
    context.addIssue({
      code: "custom",
      message: "reported nit is valid only for reported minor findings",
      path: ["reportedNit"],
    });
  }
  if (item.sourceVerification === "not-supported") return;
  if (item.verifiedNit === true && item.verifiedSeverity !== "minor") {
    context.addIssue({
      code: "custom",
      message: "verified nit is valid only for verified minor findings",
      path: ["verifiedNit"],
    });
  }
  if (item.verifiedNit === true && item.gating !== "record-only") {
    context.addIssue({ code: "custom", message: "verified nit findings are record-only", path: ["gating"] });
  }
  if (item.verifiedSeverity !== "minor" && item.gating !== "blocking") {
    context.addIssue({ code: "custom", message: "critical and major findings are blocking", path: ["gating"] });
  }
});
export type DispositionReportItem = z.infer<typeof DispositionReportItemSchema>;

/** Resolve the approved verified grade, or null when the observation was not supported. */
export function verifiedDispositionSeverity(item: DispositionReportItem): z.infer<typeof ReviewSeveritySchema> | null {
  return item.verifiedSeverity;
}

/** Resolve the reported grade used to bind a disposition to its producer finding. */
export function reportedDispositionSeverity(item: DispositionReportItem): z.infer<typeof ReviewSeveritySchema> {
  return item.reportedSeverity;
}

/** Resolve the reported nit marker independently from the verified classification. */
export function reportedDispositionNit(item: DispositionReportItem): true | undefined {
  return item.reportedNit;
}

export const FrontlineDispositionBindingSchema = z.strictObject({
  operationId: IdentifierSchema,
  sourceBindingId: CanonicalDigestSchema,
  outcomeDigest: CanonicalDigestSchema,
});
export type FrontlineDispositionBinding = z.infer<typeof FrontlineDispositionBindingSchema>;
interface DispositionProducerBinding {
  producerId: string;
  resultDigest: CanonicalDigest;
}
export type DispositionSourceContext = DispositionProducerBinding & (
  | {
      kind: "rubric";
      policyVersion: CanonicalDigest;
      rubricVersion: string;
      rubricDigest: CanonicalDigest;
    }
  | {
      kind: "frontline";
      policyVersion: CanonicalDigest;
      frontlineBinding: FrontlineDispositionBinding;
    }
);

const DispositionSetFieldsShape = {
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  targetId: CanonicalDigestSchema,
  producerId: IdentifierSchema,
  resultDigest: CanonicalDigestSchema,
  policyVersion: CanonicalDigestSchema,
  rubricVersion: IdentifierSchema.optional(),
  rubricDigest: CanonicalDigestSchema.optional(),
  frontlineBinding: FrontlineDispositionBindingSchema.optional(),
  proposedBy: IdentifierSchema,
  proposedVerification: CandidateVerificationApplicabilitySchema,
  findings: z.array(DispositionReportItemSchema).min(1),
};

function validateDispositionSourceBinding(
  value: {
    rubricVersion?: string;
    rubricDigest?: string;
    frontlineBinding?: FrontlineDispositionBinding;
  },
  context: z.RefinementCtx,
): void {
  const hasRubricVersion = value.rubricVersion !== undefined;
  const hasRubricDigest = value.rubricDigest !== undefined;
  if (hasRubricVersion !== hasRubricDigest) {
    context.addIssue({
      code: "custom",
      message: "rubric version and digest must be supplied together",
      path: [hasRubricVersion ? "rubricDigest" : "rubricVersion"],
    });
    return;
  }
  if (hasRubricVersion === (value.frontlineBinding !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "disposition set must bind exactly one rubric or frontline source context",
      path: [value.frontlineBinding === undefined ? "rubricVersion" : "frontlineBinding"],
    });
  }
}

export const DispositionSetPreimageSchema = z.strictObject({
  domain: z.literal("arc.review-gate.disposition-set/v2"),
  ...DispositionSetFieldsShape,
}).superRefine(validateDispositionSourceBinding);
export type DispositionSetPreimage = z.infer<typeof DispositionSetPreimageSchema>;

export const DispositionSetSchema = z.strictObject({
  ...DispositionSetFieldsShape,
  dispositionSetId: CanonicalDigestSchema,
}).superRefine(validateDispositionSourceBinding);
export type DispositionSet = z.infer<typeof DispositionSetSchema>;

/**
 * Compare one disposition set with the exact source context that produced its findings.
 *
 * @param set - Canonical disposition set to inspect.
 * @param context - Durable source context expected for that set.
 * @returns Whether policy and source-specific bindings match exactly.
 */
export function dispositionSetMatchesSourceContext(
  set: DispositionSet,
  context: DispositionSourceContext,
): boolean {
  return set.producerId === context.producerId
    && set.resultDigest === context.resultDigest
    && (context.kind === "rubric"
    ? set.policyVersion === context.policyVersion
      && set.rubricVersion === context.rubricVersion
      && set.rubricDigest === context.rubricDigest
      && set.frontlineBinding === undefined
    : set.policyVersion === context.policyVersion
      && set.rubricVersion === undefined
      && set.rubricDigest === undefined
      && set.frontlineBinding?.operationId === context.frontlineBinding.operationId
      && set.frontlineBinding.sourceBindingId === context.frontlineBinding.sourceBindingId
      && set.frontlineBinding.outcomeDigest === context.frontlineBinding.outcomeDigest);
}

export const DispositionApprovalSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  targetId: CanonicalDigestSchema,
  dispositionSetId: CanonicalDigestSchema,
  approvedBy: IdentifierSchema,
  approvedAt: z.iso.datetime({ offset: true }),
});
export type DispositionApproval = z.infer<typeof DispositionApprovalSchema>;

const DispositionStateFields = {
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  dispositionSet: DispositionSetSchema,
};

export const ProposedDispositionSetSchema = z.strictObject({
  ...DispositionStateFields,
  state: z.literal("proposed"),
});
export type ProposedDispositionSet = z.infer<typeof ProposedDispositionSetSchema>;

const ApprovedDispositionSetObjectSchema = z.strictObject({
  ...DispositionStateFields,
  state: z.literal("approved"),
  approval: DispositionApprovalSchema,
});
export const ApprovedDispositionSetSchema = ApprovedDispositionSetObjectSchema.superRefine((state, context) => {
  if (state.approval.targetId !== state.dispositionSet.targetId
    || state.approval.dispositionSetId !== state.dispositionSet.dispositionSetId) {
    context.addIssue({ code: "custom", message: "approval must bind the exact disposition set and target" });
  }
  if (state.approval.approvedBy === state.dispositionSet.proposedBy) {
    context.addIssue({ code: "custom", message: "approval actor must be distinct from the proposer" });
  }
});
export type ApprovedDispositionSet = z.infer<typeof ApprovedDispositionSetSchema>;

export const DispositionSetStateSchema = z.union([
  ProposedDispositionSetSchema,
  ApprovedDispositionSetSchema,
]);
export type DispositionSetState = z.infer<typeof DispositionSetStateSchema>;

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
  registry.register(ProposedDispositionSetSchema, {
    id: "proposed-disposition-set",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(ApprovedDispositionSetSchema, {
    id: "approved-disposition-set",
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(DispositionSetStateSchema, {
    id: "disposition-set-state",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
