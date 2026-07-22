/** Shared result contract for state-touching locus operations. */

import { z } from "zod";

import { LocusIdentityV1Schema } from "./identity.js";
import { LocusAbsolutePathSchema, LocusDigestSchema, LocusOpaqueTextSchema, LocusTokenSchema } from "./limits.js";

export const LocusOperationSchema = z.enum([
  "locus-attach", "locus-release", "locus-resolve", "errand-open", "errand-link", "errand-leave",
  "errand-close", "errand-abandon", "errand-materialize", "errand-promote", "plan-open", "plan-close",
  "plan-abandon", "housekeep-open", "housekeep-close", "housekeep-abandon",
]);
export const LocusRefusalReasonSchema = z.enum([
  "primary-occupied", "primary-dirty", "primary-off-base", "topology-unknown", "record-malformed",
  "duplicate-locus", "checkout-missing", "lease-live", "lease-unknown", "lease-generation-mismatch",
  "role-conflict", "full-protection-required", "remote-unreachable", "identity-conflict",
  "change-request-open", "change-request-unverifiable", "partial-handoff-forbidden", "preservation-unproven",
  "inbox-link-conflict", "work-unit-name-taken", "promotion-source-invalid", "dispatch-conflict",
  "routing-plan-mismatch", "routing-lane-downgrade", "stub-ambiguous",
]);
const common = { operation: LocusOperationSchema, recommendedPromptText: LocusOpaqueTextSchema };
const success = {
  ...common,
  allocation: z.strictObject({ kind: z.enum(["primary", "spawned"]), checkoutPath: LocusAbsolutePathSchema }).nullable(),
  recordId: LocusDigestSchema.nullable(),
  leaseId: LocusTokenSchema.nullable(),
  activeLocusPath: LocusAbsolutePathSchema.nullable(),
  sessionHomePath: LocusAbsolutePathSchema.nullable(),
  identity: LocusIdentityV1Schema.nullable(),
  originEntry: LocusOpaqueTextSchema.nullable(),
  dispatchId: LocusOpaqueTextSchema.nullable(),
  routingPlanDigest: LocusDigestSchema.nullable(),
  restoredParent: z.strictObject({ recordId: LocusDigestSchema, checkoutPath: LocusAbsolutePathSchema }).nullable(),
  nextOffer: z.strictObject({ kind: z.enum(["errand", "housekeep"]), key: LocusOpaqueTextSchema, dispatchId: LocusOpaqueTextSchema, parentCheckoutPath: LocusAbsolutePathSchema.nullable() }).nullable(),
};

const LOCUS_OPEN_OPERATIONS = new Set(["errand-open", "plan-open", "housekeep-open"]);

export const LocusMutationResultV1Schema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.enum(["applied", "idempotent"]), ...success }),
  z.strictObject({ outcome: z.literal("refused"), ...common, reason: LocusRefusalReasonSchema }),
  z.strictObject({
    outcome: z.literal("error"), ...common,
    error: z.strictObject({ code: z.string().regex(/^locus\.[a-z0-9-]+(?:\.[a-z0-9-]+)*$/u), message: LocusOpaqueTextSchema }),
  }),
]).superRefine((value, context) => {
  if ((value.outcome === "applied" || value.outcome === "idempotent")
    && LOCUS_OPEN_OPERATIONS.has(value.operation)) {
    if (value.activeLocusPath === null) {
      context.addIssue({ code: "custom", path: ["activeLocusPath"], message: "Open success requires active locus" });
    }
    if (value.sessionHomePath === null) {
      context.addIssue({ code: "custom", path: ["sessionHomePath"], message: "Open success requires session home" });
    }
  }
});

export type LocusOperation = z.infer<typeof LocusOperationSchema>;
export type LocusRefusalReason = z.infer<typeof LocusRefusalReasonSchema>;
export type LocusMutationResultV1 = z.infer<typeof LocusMutationResultV1Schema>;
