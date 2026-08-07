/** Public result contract for exact-generation Errand promotion. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusMutationErrorCodeSchema,
  LocusOpaqueTextSchema,
  LocusRefusalReasonSchema,
  LocusTokenSchema,
} from "../locus/schema/index.js";
import { ErrandTerminalGenerationSchema } from "./terminal-result.js";

const operation = z.literal("errand-promote");
const subject = z.strictObject({
  kind: z.literal("errand"),
  slug: SlugSchema,
  claimId: LocusTokenSchema,
});
const common = {
  operation,
  recommendedPromptText: LocusOpaqueTextSchema,
};
const exact = {
  ...common,
  subject,
  generation: ErrandTerminalGenerationSchema,
  branch: LocusOpaqueTextSchema,
  metaPath: LocusOpaqueTextSchema,
  checkoutPath: LocusAbsolutePathSchema,
  allocation: z.enum(["primary", "spawned"]),
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
};
const settlement = z.union([
  z.strictObject({
    state: z.literal("commit-required"),
    identity: z.literal("retained"),
    originEntry: LocusOpaqueTextSchema.nullable(),
    originEntrySourceDigest: LocusDigestSchema.nullable(),
  }),
  z.strictObject({
    state: z.literal("settled"),
    identity: z.literal("retired"),
    originEntry: z.null(),
    originEntrySourceDigest: z.null(),
  }),
]);
const refusalReason = z.union([
  LocusRefusalReasonSchema,
  z.enum(["authority-unresolved", "generation-mismatch"]),
]);

export const ErrandPromotionResultSchema = z.union([
  z.strictObject({ outcome: z.enum(["applied", "idempotent"]), ...exact, settlement }),
  z.strictObject({
    outcome: z.literal("confirmation-required"),
    ...common,
    subject,
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema,
    destructiveEffect: LocusOpaqueTextSchema,
  }),
  z.strictObject({
    outcome: z.literal("refused"),
    ...common,
    subject: subject.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    reason: refusalReason,
  }),
  z.strictObject({
    outcome: z.literal("error"),
    ...common,
    subject: subject.nullable(),
    checkoutPath: LocusAbsolutePathSchema.nullable(),
    generation: ErrandTerminalGenerationSchema.nullable(),
    error: z.strictObject({ code: LocusMutationErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]);

export type ErrandPromotionResult = z.infer<typeof ErrandPromotionResultSchema>;

/**
 * Validate one complete promotion result at its producer boundary.
 *
 * @param value - Candidate promotion result
 * @returns The strict public promotion result
 */
export function createErrandPromotionResult(
  value: z.input<typeof ErrandPromotionResultSchema>,
): ErrandPromotionResult {
  return ErrandPromotionResultSchema.parse(value);
}
