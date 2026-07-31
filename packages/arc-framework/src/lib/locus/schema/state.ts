/** Public locus roster and state projection contracts. */

import { z } from "zod";

import { LoadSetManifestSchema } from "../../load-set/types.js";
import { TaskListCursorFileResultSchema } from "../../task-list/file-cursor.js";
import { LocusIdentityV1Schema } from "./identity.js";
import { LocusAbsolutePathSchema, LocusDigestSchema, LocusOpaqueTextSchema, LocusTimestampSchema, LocusTokenSchema } from "./limits.js";

export const LocusDiagnosticCodeSchema = z.enum([
  "record-without-checkout", "worktree-without-role", "subject-unresolved", "unsupported-version",
  "duplicate-locus", "marker-missing", "lease-dead", "lease-unknown", "lock-dead", "lock-unknown",
  "cross-identity", "record-malformed", "identity-malformed", "lock-without-record", "path-unavailable",
]);
export const LocusDiagnosticV1Schema = z.strictObject({
  code: LocusDiagnosticCodeSchema,
  source: z.strictObject({
    kind: z.enum(["checkout", "record", "identity", "lock"]),
    key: LocusOpaqueTextSchema,
  }),
  message: LocusOpaqueTextSchema,
});

const rowRole = z.strictObject({
  kind: LocusOpaqueTextSchema,
  subject: z.strictObject({ kind: LocusOpaqueTextSchema, key: LocusOpaqueTextSchema, claimId: LocusTokenSchema.nullable() }),
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  originEntry: LocusOpaqueTextSchema.nullable(),
  originEntrySourceDigest: LocusDigestSchema.optional(),
});
const rowLease = z.strictObject({
  leaseId: LocusTokenSchema,
  state: z.enum(["live", "dead", "unknown"]),
  /**
   * Whether the recorded anchor is the reading process's own.
   *
   * Orthogonal to `state`, which answers occupancy: a self-held lease is `live` and its checkout is
   * occupied. This answers authority — whether the reader may act on the lease — and is the one
   * question no consumer can derive, since the anchor it compares stays private to the reader.
   */
  selfHeld: z.boolean(),
  sessionHomePath: LocusAbsolutePathSchema,
  attachedAt: LocusTimestampSchema,
  heartbeatAt: LocusTimestampSchema,
});
const derived = z.strictObject({
  workflow: LocusOpaqueTextSchema.nullable(),
  stage: LocusOpaqueTextSchema.nullable(),
  sessionType: LocusOpaqueTextSchema.nullable(),
  taskCursor: TaskListCursorFileResultSchema.nullable(),
  loadSet: LoadSetManifestSchema.nullable(),
});

export const LocusRowV1Schema = z.strictObject({
  kind: z.enum(["free-primary", "managed-role", "identity-only", "unmanaged-checkout", "stale-record", "malformed-record", "duplicate-locus"]),
  checkoutPath: LocusAbsolutePathSchema.nullable(),
  primary: z.boolean().nullable(),
  recordId: LocusDigestSchema.nullable(),
  role: rowRole.nullable(),
  identity: LocusIdentityV1Schema.nullable(),
  lease: rowLease.nullable(),
  frame: z.enum(["active", "suspended", "idle", "residue"]).nullable(),
  derived: derived.nullable(),
  diagnostics: z.array(LocusDiagnosticV1Schema),
});

export const LocusEnvelopeV1Schema = z.discriminatedUnion("ok", [
  z.strictObject({ mode: z.literal("locus"), ok: z.literal(true), primaryPath: LocusAbsolutePathSchema, rows: z.array(LocusRowV1Schema), diagnostics: z.array(LocusDiagnosticV1Schema) }),
  z.strictObject({
    mode: z.literal("locus"), ok: z.literal(false),
    error: z.strictObject({
      code: z.enum(["identity-missing", "identity-root-unavailable", "git-topology-unavailable", "record-root-unavailable"]),
      message: LocusOpaqueTextSchema,
    }),
  }),
]);

export const LocusStopReasonSchema = z.enum([
  "primary-dirty", "primary-off-base", "lease-live", "lease-unknown", "lock-live", "lock-unknown",
  "role-conflict", "record-malformed", "unsupported-version", "identity-malformed", "path-unavailable",
  "duplicate-locus", "cross-identity", "marker-missing", "subject-unresolved",
]);
export const LocusReconcileActionSchema = z.strictObject({
  kind: z.enum(["adopt-work-unit", "adopt-transient", "reap-stale-record", "break-dead-lock"]),
  checkoutPath: LocusAbsolutePathSchema.nullable(),
  recordId: LocusDigestSchema.nullable(),
});

export const LocusStateV1Schema = z.strictObject({
  roster: LocusEnvelopeV1Schema.refine((value) => value.ok),
  current: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("none") }),
    z.strictObject({ kind: z.literal("resolved"), sessionHomeRecordId: LocusDigestSchema.nullable(), activeRecordId: LocusDigestSchema, parentRecordId: LocusDigestSchema.nullable() }),
    z.strictObject({ kind: z.literal("ambiguous"), recordIds: z.array(LocusDigestSchema), reasons: z.array(LocusStopReasonSchema) }),
  ]),
  primaryAvailability: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("free"), checkoutPath: LocusAbsolutePathSchema }),
    z.strictObject({ kind: z.literal("occupied"), checkoutPath: LocusAbsolutePathSchema, recordId: LocusDigestSchema, leaseState: z.enum(["absent", "live", "dead", "unknown"]) }),
    z.strictObject({ kind: z.literal("unsafe"), checkoutPath: LocusAbsolutePathSchema, reasons: z.array(LocusStopReasonSchema) }),
  ]),
  inFlightIdentities: z.array(z.strictObject({ identity: LocusIdentityV1Schema, actions: z.array(z.enum(["resume", "wait", "finalize", "abandon"])) })),
  recovery: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("none") }),
    z.strictObject({ kind: z.literal("resume"), activeRecordId: LocusDigestSchema, parentRecordId: LocusDigestSchema.nullable() }),
    z.strictObject({ kind: z.literal("residue"), recordId: LocusDigestSchema, actions: z.array(z.enum(["resume", "abandon"])) }),
    z.strictObject({ kind: z.literal("stop"), reasons: z.array(LocusStopReasonSchema) }),
  ]),
  reconciliation: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("clean") }),
    z.strictObject({ kind: z.literal("apply"), actions: z.array(LocusReconcileActionSchema) }),
    z.strictObject({ kind: z.literal("stop"), reasons: z.array(LocusStopReasonSchema) }),
  ]),
});

export type LocusDiagnosticV1 = z.infer<typeof LocusDiagnosticV1Schema>;
export type LocusRowV1 = z.infer<typeof LocusRowV1Schema>;
export type LocusEnvelopeV1 = z.infer<typeof LocusEnvelopeV1Schema>;
export type LocusStopReason = z.infer<typeof LocusStopReasonSchema>;
export type LocusReconcileAction = z.infer<typeof LocusReconcileActionSchema>;
export type LocusStateV1 = z.infer<typeof LocusStateV1Schema>;
