/** Canonical channel-neutral disposition proposals and approval records. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { FindingDispositionSchema, ReviewSeveritySchema } from "./review-primitives.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const NonEmptyTextSchema = z.string().trim().min(1).max(4096);
const ReferenceSchema = z.string().trim().min(1);

const DispositionReportItemFieldsSchema = z.strictObject({
  findingId: z.string().trim().min(1).max(512),
  sourceIdentity: IdentifierSchema,
  locus: z.string().trim().min(1).max(2048),
  sourceVerification: z.enum(["verified", "not-supported"]),
  verificationRefs: z.array(ReferenceSchema).min(1),
  nit: z.literal(true).optional(),
  disposition: FindingDispositionSchema,
  gating: z.enum(["blocking", "record-only"]),
  rationale: NonEmptyTextSchema,
  recommendation: NonEmptyTextSchema,
  openQuestions: z.array(NonEmptyTextSchema),
});

const CollapsedDispositionGradeSchema = DispositionReportItemFieldsSchema.extend({
  sourceVerification: z.literal("verified"),
  /** The one unqualified grade when reviewer and ARC assessment agree. */
  severity: ReviewSeveritySchema,
});

const RegradedDispositionGradeSchema = DispositionReportItemFieldsSchema.extend({
  sourceVerification: z.literal("verified"),
  /** Reviewer-reported grade when ARC's effective grade differs. */
  reviewerSeverity: ReviewSeveritySchema,
  /** Reviewer-reported nit marker when ARC's effective classification cannot carry it. */
  reviewerNit: z.literal(true).optional(),
  /** ARC's effective grade when it differs from the reviewer grade. */
  arcSeverity: ReviewSeveritySchema,
}).refine((item) => item.reviewerSeverity !== item.arcSeverity, {
  message: "matching reviewer and ARC severities collapse to the unqualified severity",
  path: ["arcSeverity"],
});

const UnsupportedDispositionGradeSchema = DispositionReportItemFieldsSchema.extend({
  sourceVerification: z.literal("not-supported"),
  disposition: z.literal("reject"),
  /** The reviewer's reported grade; ARC assigns no effective grade to an unsupported finding. */
  reviewerSeverity: ReviewSeveritySchema,
  reviewerNit: z.literal(true).optional(),
});

export const DispositionReportItemSchema = z.union([
  CollapsedDispositionGradeSchema,
  RegradedDispositionGradeSchema,
  UnsupportedDispositionGradeSchema,
]).superRefine((item, context) => {
  const severity = "severity" in item
    ? item.severity
    : "arcSeverity" in item
      ? item.arcSeverity
      : item.reviewerSeverity;
  if ("arcSeverity" in item && item.reviewerSeverity === item.arcSeverity) {
    context.addIssue({
      code: "custom",
      message: "matching reviewer and effective severities collapse to the unqualified severity",
      path: ["arcSeverity"],
    });
  }
  if (item.nit === true && severity !== "minor") {
    context.addIssue({ code: "custom", message: "nit is valid only for minor findings", path: ["nit"] });
  }
  if ("reviewerNit" in item && item.reviewerNit === true && item.reviewerSeverity !== "minor") {
    context.addIssue({ code: "custom", message: "reviewer nit is valid only for reviewer minor findings", path: ["reviewerNit"] });
  }
  if (item.nit === true && item.gating !== "record-only") {
    context.addIssue({ code: "custom", message: "nit findings are record-only", path: ["gating"] });
  }
  if (severity !== "minor" && item.gating !== "blocking") {
    context.addIssue({ code: "custom", message: "critical and major findings are blocking", path: ["gating"] });
  }
});
export type DispositionReportItem = z.infer<typeof DispositionReportItemSchema>;

/** Resolve ARC's effective grade, or null when ARC rejected the finding as unsupported. */
export function effectiveDispositionSeverity(
  item: DispositionReportItem,
): z.infer<typeof ReviewSeveritySchema> | null {
  return "severity" in item ? item.severity : "arcSeverity" in item ? item.arcSeverity : null;
}

/** Resolve the reviewer-reported grade used to bind a disposition to its source finding. */
export function reviewerDispositionSeverity(item: DispositionReportItem): z.infer<typeof ReviewSeveritySchema> {
  return "severity" in item ? item.severity : item.reviewerSeverity;
}

/** Resolve the reviewer's nit marker independently from ARC's effective classification. */
export function reviewerDispositionNit(item: { nit?: true; reviewerNit?: true }): true | undefined {
  return "reviewerNit" in item ? item.reviewerNit : item.nit;
}

export const FrontlineDispositionBindingSchema = z.strictObject({
  operationId: IdentifierSchema,
  sourceBindingId: CanonicalDigestSchema,
  outcomeDigest: CanonicalDigestSchema,
});
export type FrontlineDispositionBinding = z.infer<typeof FrontlineDispositionBindingSchema>;
interface DispositionProducerBinding {
  producerId: string;
  resultDigest: string;
}
export type DispositionSourceContext = DispositionProducerBinding & (
  | {
      kind: "rubric";
      policyVersion: string;
      rubricVersion: string;
      rubricDigest: string;
    }
  | {
      kind: "frontline";
      policyVersion: string;
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
