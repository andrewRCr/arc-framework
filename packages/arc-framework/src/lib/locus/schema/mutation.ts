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
  "inbox-link-conflict", "work-unit-name-taken", "promotion-source-invalid", "stub-ambiguous",
]);
/**
 * Operational failures raised at untrusted locus boundaries.
 *
 * Distinct from the per-operation stage codes below: these name the boundary that failed rather than
 * the step of an operation that reached it, and they cross the same public error arm.
 */
export const LocusOperationalErrorCodeSchema = z.enum([
  "locus.parse.invalid", "locus.topology.unavailable", "locus.persistence.read",
  "locus.persistence.write", "locus.lock.acquire", "locus.lock.release", "locus.mutation.failed",
]);

/**
 * The step of an operation a failure reached.
 *
 * Closed by construction: an operation's error code is its operation paired with one of these, so a
 * new failure path cannot introduce a code consumers have no case for without extending this list.
 */
export const LocusErrorStageSchema = z.enum([
  "anchor", "base", "base-ref", "basis", "change-request", "claim", "cleanup", "config", "failed",
  "frame", "handler",
  "host", "inbox", "input", "occupancy", "preservation", "protection", "provision", "recover",
  "recovery", "record-pop", "refs", "residue", "resume", "resume-proof", "rollback", "state",
  "push", "topology", "transform", "write",
  "ancestry", "fetch", "local-branch", "local-head", "remote-head",
  "identity", "identity-basis", "identity-cleanup", "identity-fetch", "identity-push",
  "identity-read", "identity-retire", "identity-transform", "identity-write",
  "pause-ancestry", "pause-cleanup", "pause-fetch", "pause-local-head", "pause-remote-head",
]);

export type LocusOperationalErrorCode = z.infer<typeof LocusOperationalErrorCodeSchema>;
export type LocusErrorStage = z.infer<typeof LocusErrorStageSchema>;

/** Every code the public error arm can carry. */
export type LocusMutationErrorCode =
  | LocusOperationalErrorCode
  | `locus.${z.infer<typeof LocusOperationSchema>}.${LocusErrorStage}`;

/** Compose the one code an operation may report for the step that failed. */
export function locusErrorCode(
  operation: z.infer<typeof LocusOperationSchema>,
  stage: LocusErrorStage,
): LocusMutationErrorCode {
  return `locus.${operation}.${stage}`;
}

/** Decide whether an arbitrary string belongs to the declared vocabulary. */
export function isLocusMutationErrorCode(value: string): value is LocusMutationErrorCode {
  if (LocusOperationalErrorCodeSchema.safeParse(value).success) return true;
  const segments = value.split(".");
  return segments.length === 3 && segments[0] === "locus"
    && LocusOperationSchema.safeParse(segments[1]).success
    && LocusErrorStageSchema.safeParse(segments[2]).success;
}

export const LocusMutationErrorCodeSchema = z.custom<LocusMutationErrorCode>(
  (value) => typeof value === "string" && isLocusMutationErrorCode(value),
  { error: "Error code must be a declared operational code or `locus.<operation>.<stage>`" },
);

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
  originEntrySourceDigest: LocusDigestSchema.nullable().optional(),
  restoredParent: z.strictObject({ recordId: LocusDigestSchema, checkoutPath: LocusAbsolutePathSchema }).nullable(),
  nextOffer: z.strictObject({
    kind: z.literal("errand"),
    key: LocusOpaqueTextSchema,
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  }).nullable(),
};

const LOCUS_OPEN_OPERATIONS = new Set(["errand-open", "plan-open", "housekeep-open"]);

export const LocusMutationResultV1Schema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.enum(["applied", "idempotent"]), ...success }),
  z.strictObject({ outcome: z.literal("refused"), ...common, reason: LocusRefusalReasonSchema }),
  z.strictObject({
    outcome: z.literal("error"), ...common,
    error: z.strictObject({ code: LocusMutationErrorCodeSchema, message: LocusOpaqueTextSchema }),
  }),
]).superRefine((value, context) => {
  if ((value.outcome === "applied" || value.outcome === "idempotent")
    && LOCUS_OPEN_OPERATIONS.has(value.operation)) {
    if (value.allocation === null) {
      context.addIssue({ code: "custom", path: ["allocation"], message: "Open success requires an allocation" });
    }
    if (value.recordId === null) {
      context.addIssue({ code: "custom", path: ["recordId"], message: "Open success requires a record identifier" });
    }
    if (value.leaseId === null) {
      context.addIssue({ code: "custom", path: ["leaseId"], message: "Open success requires a lease identifier" });
    }
    if (value.activeLocusPath === null) {
      context.addIssue({ code: "custom", path: ["activeLocusPath"], message: "Open success requires an active session locus" });
    }
    if (value.sessionHomePath === null) {
      context.addIssue({ code: "custom", path: ["sessionHomePath"], message: "Open success requires session home" });
    }
  }
});

export type LocusOperation = z.infer<typeof LocusOperationSchema>;
export type LocusRefusalReason = z.infer<typeof LocusRefusalReasonSchema>;
export type LocusMutationResultV1 = z.infer<typeof LocusMutationResultV1Schema>;
