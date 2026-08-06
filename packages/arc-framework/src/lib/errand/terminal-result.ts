/** Public result contract for Errand terminal operations. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import {
  LocusAbsolutePathSchema,
  LocusChangeRequestV1Schema,
  LocusDigestSchema,
  LocusMutationErrorCodeSchema,
  LocusOpaqueTextSchema,
  LocusRefusalReasonSchema,
  LocusTokenSchema,
} from "../locus/schema/index.js";

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

export const ErrandTerminalResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.enum(["applied", "idempotent"]),
    ...common,
    subject: ErrandTerminalSubjectSchema,
    generation: ErrandTerminalGenerationSchema,
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
    settlement,
    nextOffer,
  }),
  z.strictObject({
    outcome: z.literal("confirmation-required"),
    ...common,
    subject: ErrandTerminalSubjectSchema,
    checkoutPath: LocusAbsolutePathSchema,
    generation: ErrandTerminalGenerationSchema,
    destructiveEffect: LocusOpaqueTextSchema,
  }),
  z.strictObject({
    outcome: z.literal("refused"),
    ...common,
    subject: ErrandTerminalSubjectSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    reason: z.union([
      LocusRefusalReasonSchema,
      z.enum(["authority-unresolved", "generation-mismatch"]),
    ]),
  }),
  z.strictObject({
    outcome: z.literal("error"),
    ...common,
    subject: ErrandTerminalSubjectSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    error: z.strictObject({ code: LocusMutationErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]);
export type ErrandTerminalResult = z.infer<typeof ErrandTerminalResultSchema>;

/** Validate one complete terminal-operation result at its producer boundary. */
export function createErrandTerminalResult(
  value: z.input<typeof ErrandTerminalResultSchema>,
): ErrandTerminalResult {
  return ErrandTerminalResultSchema.parse(value);
}
