/** Public result contract shared by Errand open, materialize, and link. */

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import {
  LocusIdentityV1Schema,
} from "../locus/schema/index.js";
import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "../locus/schema/limits.js";
import { ErrandErrorCodeSchema, ErrandRefusalReasonSchema } from "./result-common.js";

export const ErrandOperationSchema = z.enum(["errand-open", "errand-materialize", "errand-link"]);

const common = {
  operation: ErrandOperationSchema,
  recommendedPromptText: LocusOpaqueTextSchema,
};

const success = {
  ...common,
  allocation: z.strictObject({
    kind: z.enum(["primary", "spawned"]),
    checkoutPath: LocusAbsolutePathSchema,
  }).nullable(),
  subject: z.strictObject({
    kind: z.literal("errand"),
    key: SlugSchema,
    claimId: LocusTokenSchema.nullable(),
  }),
  parentCheckoutPath: LocusAbsolutePathSchema.optional(),
  identity: LocusIdentityV1Schema.nullable(),
  originEntry: LocusOpaqueTextSchema.nullable(),
  originEntrySourceDigest: LocusDigestSchema.nullable(),
  nextOffer: z.strictObject({
    kind: z.literal("errand"),
    key: LocusOpaqueTextSchema,
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  }).nullable(),
};

export const ErrandOperationResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.enum(["applied", "idempotent"]), ...success }),
  z.strictObject({ outcome: z.literal("refused"), ...common, reason: ErrandRefusalReasonSchema }),
  z.strictObject({
    outcome: z.literal("error"),
    ...common,
    error: z.strictObject({ code: ErrandErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]).superRefine((value, context) => {
  if (value.outcome !== "applied" && value.outcome !== "idempotent") return;
  if (value.operation === "errand-link") {
    if (value.allocation !== null) {
      context.addIssue({ code: "custom", path: ["allocation"], message: "Link success has no allocation" });
    }
    if (value.parentCheckoutPath !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["parentCheckoutPath"],
        message: "Link success has no parent checkout",
      });
    }
    return;
  }
  if (value.allocation === null) {
    context.addIssue({ code: "custom", path: ["allocation"], message: "Allocation success requires a checkout" });
  }
});

export type ErrandOperation = z.infer<typeof ErrandOperationSchema>;
export type ErrandOperationResult = z.infer<typeof ErrandOperationResultSchema>;

/** Validate one final Errand operation result at its producer boundary. */
export function createErrandOperationResult(
  value: z.input<typeof ErrandOperationResultSchema>,
): ErrandOperationResult {
  return ErrandOperationResultSchema.parse(value);
}
