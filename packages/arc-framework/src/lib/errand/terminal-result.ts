/** Public result contract for Errand terminal operations. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import {
  LocusAbsolutePathSchema,
  LocusChangeRequestV1Schema,
  LocusDigestSchema,
  LocusIdentityV1Schema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "../locus/schema/index.js";
import type { ErrandTerminalAuthority } from "./terminal-authority.js";
import { ErrandErrorCodeSchema, ErrandRefusalReasonSchema } from "./result-common.js";

export const ErrandTerminalOperationSchema = z.enum(["errand-close", "errand-abandon", "errand-leave"]);
export const ErrandTerminalSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("errand"), slug: SlugSchema, claimId: LocusTokenSchema }),
  z.strictObject({ kind: z.literal("partial-errand"), slug: SlugSchema, claimId: z.null() }),
]);
export const ErrandTerminalGenerationSchema = z.union([
  z.string().regex(/^errand-v1\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-f0-9]{32}$/u),
  LocusDigestSchema,
]);

const common = {
  operation: ErrandTerminalOperationSchema,
  recommendedPromptText: LocusOpaqueTextSchema,
};
const terminalRefusalReason = ErrandRefusalReasonSchema;

const nextOffer = z.strictObject({
  kind: z.literal("errand"),
  key: LocusOpaqueTextSchema,
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
}).nullable();
const settlement = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("capture"),
    disposition: z.enum(["removed", "retained", "absent"]),
    originEntry: LocusOpaqueTextSchema.nullable(),
    originEntrySourceDigest: LocusDigestSchema.nullable().optional(),
  }),
  z.strictObject({
    kind: z.literal("identity-tail"),
    state: z.enum(["paused", "awaiting-merge"]),
    savedHead: z.string().regex(/^[a-f0-9]{40}$/u).nullable(),
    changeRequest: LocusChangeRequestV1Schema.nullable(),
    originEntry: LocusOpaqueTextSchema.nullable(),
    originEntrySourceDigest: LocusDigestSchema.nullable().optional(),
  }),
]);

const exactSuccess = {
  ...common,
  subject: ErrandTerminalSubjectSchema,
  generation: ErrandTerminalGenerationSchema,
  checkoutPath: LocusAbsolutePathSchema.nullable(),
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  settlement,
  nextOffer,
};

export const ErrandTerminalResultSchema = z.union([
  z.strictObject({
    outcome: z.literal("applied"),
    ...exactSuccess,
  }),
  z.union([
    z.strictObject({ outcome: z.literal("idempotent"), ...exactSuccess }),
    z.strictObject({
      outcome: z.literal("idempotent"),
      ...common,
      subject: z.null(),
      generation: z.null(),
      checkoutPath: z.null(),
      parentCheckoutPath: z.null(),
      settlement,
      nextOffer,
    }),
  ]),
  z.strictObject({
    outcome: z.literal("confirmation-required"),
    ...common,
    subject: ErrandTerminalSubjectSchema,
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema,
    destructiveEffect: LocusOpaqueTextSchema,
  }),
  z.strictObject({
    outcome: z.literal("refused"),
    ...common,
    subject: ErrandTerminalSubjectSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    reason: terminalRefusalReason,
  }),
  z.strictObject({
    outcome: z.literal("error"),
    ...common,
    subject: ErrandTerminalSubjectSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    error: z.strictObject({ code: ErrandErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]);
export type ErrandTerminalResult = z.infer<typeof ErrandTerminalResultSchema>;

const terminalOperationOutcomeCommon = {
  operation: ErrandTerminalOperationSchema,
  recommendedPromptText: LocusOpaqueTextSchema,
};

const TerminalOperationOutcomeSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.enum(["applied", "idempotent"]),
    ...terminalOperationOutcomeCommon,
    identity: LocusIdentityV1Schema.nullable(),
    nextOffer,
  }),
  z.strictObject({
    outcome: z.literal("refused"),
    ...terminalOperationOutcomeCommon,
    reason: ErrandRefusalReasonSchema,
  }),
  z.strictObject({
    outcome: z.literal("error"),
    ...terminalOperationOutcomeCommon,
    error: z.strictObject({ code: ErrandErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]);

/** Private composition outcome consumed only while constructing the public terminal result. */
export type TerminalOperationOutcome = z.infer<typeof TerminalOperationOutcomeSchema>;

/** Validate an internal terminal composition outcome. */
export function createTerminalOperationOutcome(
  value: z.input<typeof TerminalOperationOutcomeSchema>,
): TerminalOperationOutcome {
  return TerminalOperationOutcomeSchema.parse(value);
}

/** Validate one complete terminal-operation result at its producer boundary. */
export function createErrandTerminalResult(
  value: z.input<typeof ErrandTerminalResultSchema>,
): ErrandTerminalResult {
  return ErrandTerminalResultSchema.parse(value);
}

export interface CompleteErrandTerminalResultOptions {
  readonly result: TerminalOperationOutcome;
  readonly authority: ErrandTerminalAuthority | null;
  readonly evidence: {
    readonly subject: z.input<typeof ErrandTerminalSubjectSchema>;
    readonly generation: string;
    readonly checkoutPath: string | null;
    readonly parentCheckoutPath: string | null;
    readonly settlement: z.input<typeof settlement>;
  } | null;
}

/** Complete one terminal result from its operation outcome and exact authority evidence. */
export function completeErrandTerminalResult(
  options: CompleteErrandTerminalResultOptions,
): ErrandTerminalResult {
  const operation = ErrandTerminalOperationSchema.parse(options.result.operation);
  const commonResult = {
    operation,
    recommendedPromptText: options.result.recommendedPromptText,
  };
  if (options.result.outcome === "applied" || options.result.outcome === "idempotent") {
    if (options.evidence === null) {
      if (options.result.outcome === "applied") {
        return createErrandTerminalResult({
          outcome: "error",
          ...commonResult,
          subject: null,
          checkoutPath: null,
          generation: null,
          error: {
            code: terminalHandlerErrorCode(operation),
            message: "Applied terminal result has no exact subject generation.",
          },
        });
      }
      return createErrandTerminalResult({
        outcome: "idempotent",
        ...commonResult,
        subject: null,
        generation: null,
        checkoutPath: null,
        parentCheckoutPath: null,
        settlement: { kind: "capture", disposition: "absent", originEntry: null },
        nextOffer: options.result.nextOffer,
      });
    }
    return createErrandTerminalResult({
      outcome: options.result.outcome,
      ...commonResult,
      ...options.evidence,
      nextOffer: options.result.nextOffer,
    });
  }
  if (options.result.outcome === "refused") {
    if (options.authority?.kind === "confirmation-required"
      && options.result.recommendedPromptText === options.authority.recommendedPromptText) {
      return createErrandTerminalResult({
        outcome: "confirmation-required",
        ...commonResult,
        subject: options.authority.subject,
        checkoutPath: options.authority.checkoutPath,
        generation: options.authority.generation,
        destructiveEffect: options.authority.destructiveEffect,
      });
    }
    return createErrandTerminalResult({
      outcome: "refused",
      ...commonResult,
      subject: options.evidence?.subject ?? null,
      checkoutPath: options.evidence?.checkoutPath ?? null,
      generation: options.evidence?.generation ?? null,
      reason: options.authority?.kind === "refused"
        ? terminalRefusalReason.parse(options.authority.reason)
        : options.result.reason,
    });
  }
  if (!("error" in options.result)) {
    throw new Error(`Unsupported terminal outcome: ${String(options.result.outcome)}`);
  }
  return createErrandTerminalResult({
    outcome: "error",
    ...commonResult,
    subject: options.evidence?.subject ?? null,
    checkoutPath: options.evidence?.checkoutPath ?? null,
    generation: options.evidence?.generation ?? null,
    error: options.result.error,
  });
}

function terminalHandlerErrorCode(
  operation: z.infer<typeof ErrandTerminalOperationSchema>,
): z.infer<typeof ErrandErrorCodeSchema> {
  switch (operation) {
    case "errand-close": return "locus.errand-close.handler";
    case "errand-abandon": return "locus.errand-abandon.handler";
    case "errand-leave": return "locus.errand-leave.handler";
  }
}
