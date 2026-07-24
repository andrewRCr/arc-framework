/** Registered command-result envelopes for the public review transition protocol. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import {
  FrontlineFailedRepairReasonSchema,
  FrontlineFailedRetryReasonSchema,
  FrontlineStaleTargetReasonSchema,
  FrontlineTimedOutReasonSchema,
  FrontlineUnavailableRepairReasonSchema,
  FrontlineUnavailableRetryReasonSchema,
} from "../policy/frontline-outcome.js";
import { FrontlineFollowUpAdviceSchema } from "../policy/frontline-follow-up.js";
import { ReviewResolveEnvelopeSchema } from "../policy/review-policy-driver.js";
import { FrontlineSemanticRecordSchema } from "../policy/frontline-semantic.js";
import { ReviewPassSchema } from "./review-pass.js";
import { ReviewRoutingProjectionSchema } from "../policy/routing-schema.js";
import { ReviewReductionProjectionSchema } from "./advisory-records.js";
import { NormalizedReviewFindingSchema } from "./finding-records.js";
import { ProposedDispositionSetSchema } from "./disposition-records.js";
import { FixAuthorizationSchema } from "./fix-authorization-records.js";
import { NormalizedLocalReviewResultSchema } from "./local-review-result.js";
import {
  ReviewRequestV2Schema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";
import { LocalReviewerPayloadSchema } from "./local-review-payload.js";

const CanonicalDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const DurableReferenceSchema = z.string().trim().min(1);
const PersistedVersionSchema = z.number().int().positive();

export const ReviewCommandModeSchema = z.enum([
  "review-resolve",
  "review-frontline-resolve",
  "review-frontline-run",
  "review-local-prepare",
  "review-local-attest",
  "review-respond",
  "review-reduce",
  "review-local-resume",
]);
export type ReviewCommandMode = z.infer<typeof ReviewCommandModeSchema>;

const RepositoryPreconditionDiagnosticSchema = z.strictObject({
  code: z.literal("repository-precondition"),
  message: z.string().trim().min(1),
  precondition: z.enum([
    "repository-born",
    "base-resolved",
    "clean-worktree",
    "commit-head",
  ]),
});
const GeneralReviewCommandDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  message: z.string().trim().min(1),
});
export const ReviewCommandDiagnosticSchema = z.union([
  RepositoryPreconditionDiagnosticSchema,
  GeneralReviewCommandDiagnosticSchema,
]);

const HeaderShape = {
  schemaVersion: z.literal(1),
  diagnostics: z.array(ReviewCommandDiagnosticSchema),
};

const TargetPairPayloadSchema = z.strictObject({
  attemptedTarget: ReviewTargetSchema,
  currentTarget: ReviewTargetSchema,
});
const OperationPayloadShape = {
  operationId: IdentifierSchema,
  persistedVersion: PersistedVersionSchema,
};
const CurrentOperationPayloadShape = {
  ...OperationPayloadShape,
  currentTarget: ReviewTargetSchema,
};
const FrontlineTerminalPayloadShape = {
  ...OperationPayloadShape,
  target: ReviewTargetSchema,
  outcomeRef: DurableReferenceSchema,
  outcomeDigest: CanonicalDigestSchema,
};
const ExecutableIdentitySchema = z.strictObject({
  digest: CanonicalDigestSchema,
  qualifiedVersion: z.string().trim().min(1),
});

function envelopeVariant<
  Mode extends ReviewCommandMode,
  State extends string,
  NextAction extends string,
  Payload extends z.ZodType,
>(
  mode: Mode,
  state: State,
  nextAction: NextAction,
  payload: Payload,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  state: z.ZodLiteral<State>;
  nextAction: z.ZodLiteral<NextAction>;
  payload: Payload;
}> {
  return z.strictObject({
    ...HeaderShape,
    mode: z.literal(mode),
    state: z.literal(state),
    nextAction: z.literal(nextAction),
    payload,
  });
}

const FrontlineResolveBasePayload = {
  routing: ReviewRoutingProjectionSchema,
  frontlineReview: FrontlineSemanticRecordSchema,
};
const FrontlineReadyPayloadSchema = z.strictObject({
  ...FrontlineResolveBasePayload,
  pass: ReviewPassSchema,
  maxPasses: ReviewPassSchema,
}).superRefine((payload, context) => {
  if (payload.pass > payload.maxPasses) {
    context.addIssue({
      code: "custom",
      message: "frontline pass exceeds the ready resolution allowance",
      path: ["pass"],
    });
  }
  if (payload.maxPasses !== payload.frontlineReview.maxPasses) {
    context.addIssue({
      code: "custom",
      message: "frontline ready allowance does not match the semantic record",
      path: ["maxPasses"],
    });
  }
});
export const FrontlineResolveEnvelopeSchema = z.union([
  envelopeVariant(
    "review-frontline-resolve",
    "skipped",
    "none",
    z.strictObject(FrontlineResolveBasePayload),
  ),
  envelopeVariant(
    "review-frontline-resolve",
    "offered",
    "bind-source",
    z.strictObject(FrontlineResolveBasePayload),
  ),
  envelopeVariant(
    "review-frontline-resolve",
    "offered",
    "obtain-authorization",
    z.strictObject(FrontlineResolveBasePayload),
  ),
  envelopeVariant(
    "review-frontline-resolve",
    "ready",
    "run-frontline",
    FrontlineReadyPayloadSchema,
  ),
]);

const FrontlineCompletedPayloadSchema = z.strictObject({
  ...FrontlineTerminalPayloadShape,
  executableIdentity: ExecutableIdentitySchema.optional(),
});
const FrontlineReasonPayload = <Reason extends z.ZodType>(reason: Reason) => z.strictObject({
  ...FrontlineTerminalPayloadShape,
  executableIdentity: ExecutableIdentitySchema.optional(),
  reason,
});
export const FrontlineRunEnvelopeSchema = z.union([
  envelopeVariant("review-frontline-run", "clean", "none", FrontlineCompletedPayloadSchema),
  envelopeVariant("review-frontline-run", "findings", "respond", FrontlineCompletedPayloadSchema),
  envelopeVariant(
    "review-frontline-run",
    "unavailable",
    "retry",
    FrontlineReasonPayload(FrontlineUnavailableRetryReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "unavailable",
    "operator-repair",
    FrontlineReasonPayload(FrontlineUnavailableRepairReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "timed-out",
    "retry",
    FrontlineReasonPayload(FrontlineTimedOutReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "stale-target",
    "prepare-current-target",
    FrontlineReasonPayload(FrontlineStaleTargetReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "failed",
    "retry",
    FrontlineReasonPayload(FrontlineFailedRetryReasonSchema),
  ),
  envelopeVariant(
    "review-frontline-run",
    "failed",
    "operator-repair",
    FrontlineReasonPayload(FrontlineFailedRepairReasonSchema),
  ),
]);

export const LocalPrepareEnvelopeSchema = z.union([
  envelopeVariant("review-local-prepare", "exempt", "none", z.strictObject({})),
  envelopeVariant(
    "review-local-prepare",
    "review-complete",
    "reduce",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
    }),
  ),
  envelopeVariant(
    "review-local-prepare",
    "ready",
    "launch-review",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
      request: ReviewRequestV2Schema,
      reviewerPayload: LocalReviewerPayloadSchema,
      sourceRef: DurableReferenceSchema,
      sourceDigest: CanonicalDigestSchema,
    }),
  ),
  envelopeVariant("review-local-prepare", "unavailable", "operator-repair", z.strictObject({})),
  envelopeVariant(
    "review-local-prepare",
    "stale-target",
    "prepare-current-target",
    TargetPairPayloadSchema,
  ),
]);

const NotAttestableResultSchema = NormalizedLocalReviewResultSchema.refine(
  (result) => result.status !== "complete" || result.result === null,
  { message: "complete results with a verdict are attestable" },
);
export const LocalAttestEnvelopeSchema = z.union([
  envelopeVariant(
    "review-local-attest",
    "attested-current",
    "reduce",
    z.strictObject({
      ...OperationPayloadShape,
      target: ReviewTargetSchema,
      sourceRef: DurableReferenceSchema,
      receiptRef: DurableReferenceSchema,
      receiptRecorded: z.literal(true),
    }),
  ),
  envelopeVariant(
    "review-local-attest",
    "stale-target",
    "prepare-current-target",
    z.union([
      z.strictObject({
        ...OperationPayloadShape,
        receiptRecorded: z.literal(false),
        attemptedTarget: ReviewTargetSchema,
        currentTarget: ReviewTargetSchema,
      }),
      z.strictObject({
        ...OperationPayloadShape,
        receiptRecorded: z.literal(true),
        receiptRef: DurableReferenceSchema,
        attemptedTarget: ReviewTargetSchema,
        currentTarget: ReviewTargetSchema,
      }),
    ]),
  ),
  envelopeVariant(
    "review-local-attest",
    "expired",
    "rerun-review",
    z.strictObject(OperationPayloadShape),
  ),
  envelopeVariant(
    "review-local-attest",
    "not-attestable",
    "rerun-review",
    z.strictObject({
      ...OperationPayloadShape,
      result: NotAttestableResultSchema,
    }),
  ),
]);

const DispositionPayloadSchema = z.strictObject({
  operationId: IdentifierSchema,
  dispositionRecordRef: DurableReferenceSchema,
  frontlineFollowUp: FrontlineFollowUpAdviceSchema.optional(),
});
export const RespondEnvelopeSchema = z.union([
  envelopeVariant(
    "review-respond",
    "awaiting-approval",
    "obtain-approval",
    z.strictObject({
      operationId: IdentifierSchema,
      proposal: ProposedDispositionSetSchema,
    }),
  ),
  envelopeVariant(
    "review-respond",
    "ready-to-fix",
    "apply-fix",
    z.strictObject({
      ...DispositionPayloadSchema.shape,
      fixAuthorization: FixAuthorizationSchema,
      reentryCommand: z.enum(["local-prepare", "frontline-resolve"]),
    }),
  ),
  envelopeVariant("review-respond", "settled", "reduce", DispositionPayloadSchema),
  envelopeVariant("review-respond", "already-settled", "reduce", DispositionPayloadSchema),
  envelopeVariant(
    "review-respond",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      operationId: IdentifierSchema,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
]);

const ReductionBasePayload = {
  ...CurrentOperationPayloadShape,
};
const ReductionResponseSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: DurableReferenceSchema,
  }),
  z.strictObject({
    kind: z.literal("frontline"),
    outcomeRef: DurableReferenceSchema,
  }),
]);
export const ReduceEnvelopeSchema = z.union([
  envelopeVariant(
    "review-reduce",
    "findings",
    "respond",
    z.strictObject({
      ...ReductionBasePayload,
      projection: ReviewReductionProjectionSchema,
      responseSource: ReductionResponseSourceSchema,
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "settled",
    "none",
    z.strictObject({ ...ReductionBasePayload, projection: ReviewReductionProjectionSchema }),
  ),
  envelopeVariant(
    "review-reduce",
    "advisory-complete",
    "none",
    z.strictObject({
      ...ReductionBasePayload,
      projection: ReviewReductionProjectionSchema,
      frontlineOutcomeRef: DurableReferenceSchema.optional(),
      frontlineFollowUp: FrontlineFollowUpAdviceSchema.optional(),
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "retryable",
    "retry",
    z.strictObject({
      ...ReductionBasePayload,
      retryCommand: z.enum(["local-attest", "frontline-run"]),
      requestRef: DurableReferenceSchema,
    }),
  ),
  envelopeVariant(
    "review-reduce",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      ...OperationPayloadShape,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
]);
export type ReviewReduceEnvelope = z.infer<typeof ReduceEnvelopeSchema>;

const ResumeBasePayload = {
  ...CurrentOperationPayloadShape,
};
export const LocalResumeResponsePlanSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: ReviewTargetSchema,
  source: z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: DurableReferenceSchema,
  }),
  findings: z.array(NormalizedReviewFindingSchema).min(1),
});
export const LocalResumeEnvelopeSchema = z.union([
  envelopeVariant(
    "review-local-resume",
    "suspended",
    "wait",
    z.strictObject(ResumeBasePayload),
  ),
  envelopeVariant(
    "review-local-resume",
    "review-complete",
    "reduce",
    z.strictObject({ ...ResumeBasePayload, receiptRef: DurableReferenceSchema }),
  ),
  envelopeVariant(
    "review-local-resume",
    "respond-to-findings",
    "respond",
    z.strictObject({
      ...ResumeBasePayload,
      receiptRef: DurableReferenceSchema,
      responsePlan: LocalResumeResponsePlanSchema,
    }),
  ),
  envelopeVariant(
    "review-local-resume",
    "stale-target",
    "prepare-current-target",
    z.strictObject({
      ...OperationPayloadShape,
      ...TargetPairPayloadSchema.shape,
    }),
  ),
  envelopeVariant(
    "review-local-resume",
    "expired",
    "rerun-review",
    z.strictObject(ResumeBasePayload),
  ),
]);

export const ReviewCommandErrorEnvelopeSchema = z.union([
  ...ReviewCommandModeSchema.options.flatMap((mode) => [
    errorVariant(mode, "invalid-input"),
    errorVariant(mode, "corrupt-state"),
    errorVariant(mode, "unexpected-failure"),
  ]),
]);

function errorVariant<Mode extends ReviewCommandMode, Code extends string>(
  mode: Mode,
  code: Code,
): z.ZodObject<{
  schemaVersion: z.ZodLiteral<1>;
  diagnostics: z.ZodArray<typeof ReviewCommandDiagnosticSchema>;
  mode: z.ZodLiteral<Mode>;
  error: z.ZodObject<{
    code: z.ZodLiteral<Code>;
    message: z.ZodString;
  }>;
}> {
  return z.strictObject({
    ...HeaderShape,
    mode: z.literal(mode),
    error: z.strictObject({
      code: z.literal(code),
      message: z.string().trim().min(1),
    }),
  });
}

/** Register every command envelope as a strict-current protocol contract. */
export function registerReviewCommandEnvelopeSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    ["review-resolve-envelope", ReviewResolveEnvelopeSchema],
    ["review-frontline-resolve-envelope", FrontlineResolveEnvelopeSchema],
    ["review-frontline-run-envelope", FrontlineRunEnvelopeSchema],
    ["review-local-prepare-envelope", LocalPrepareEnvelopeSchema],
    ["review-local-attest-envelope", LocalAttestEnvelopeSchema],
    ["review-respond-envelope", RespondEnvelopeSchema],
    ["review-reduce-envelope", ReduceEnvelopeSchema],
    ["review-local-resume-envelope", LocalResumeEnvelopeSchema],
    ["review-command-error-envelope", ReviewCommandErrorEnvelopeSchema],
  ] as const) {
    registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  }
  return registry;
}
