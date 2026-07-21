/** Persisted per-checkout locus record authority. */

import { z } from "zod";

import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  LocusTimestampSchema,
  LocusTokenSchema,
} from "./limits.js";

/** Forward-compatible role subject pointer. */
export const LocusRoleSubjectSchema = z.strictObject({
  kind: LocusOpaqueTextSchema,
  key: LocusOpaqueTextSchema,
  claimId: LocusTokenSchema.nullable(),
});

/** Durable checkout role. */
export const LocusRoleSchema = z.strictObject({
  kind: LocusOpaqueTextSchema,
  subject: LocusRoleSubjectSchema,
  establishedAt: LocusTimestampSchema,
  parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  dispatchId: LocusOpaqueTextSchema.nullable(),
  originEntry: LocusOpaqueTextSchema.nullable(),
  routingPlanDigest: LocusDigestSchema.nullable(),
}).superRefine((role, context) => {
  const pair = `${role.kind}/${role.subject.kind}`;
  const knownKinds = new Set(["work-unit", "errand", "groom", "housekeep"]);
  const knownSubjects = new Set(["work-unit", "errand", "partial-errand", "groom", "housekeep"]);
  const knownPairs = new Set([
    "work-unit/work-unit",
    "errand/errand",
    "errand/partial-errand",
    "groom/groom",
    "housekeep/errand",
    "housekeep/housekeep",
  ]);
  if (knownKinds.has(role.kind) && knownSubjects.has(role.subject.kind) && !knownPairs.has(pair)) {
    context.addIssue({ code: "custom", path: ["subject", "kind"], message: "Invalid known role/subject pair" });
  }

  const identityBacked = pair === "errand/errand" || pair === "groom/groom" || pair === "housekeep/errand";
  const identityFree = pair === "work-unit/work-unit"
    || pair === "errand/partial-errand"
    || pair === "housekeep/housekeep";
  if (identityBacked && role.subject.claimId === null) {
    context.addIssue({ code: "custom", path: ["subject", "claimId"], message: "Identity-backed role requires claimId" });
  }
  if (identityFree && role.subject.claimId !== null) {
    context.addIssue({ code: "custom", path: ["subject", "claimId"], message: "Identity-free role requires null claimId" });
  }

  if (pair === "errand/partial-errand") {
    if (role.routingPlanDigest !== null) {
      context.addIssue({ code: "custom", path: ["routingPlanDigest"], message: "Partial Errand rejects routing plan" });
    }
    if (role.dispatchId !== null && role.originEntry === null) {
      context.addIssue({ code: "custom", path: ["originEntry"], message: "Dispatch-bound partial Errand requires origin entry" });
    }
  } else if (pair === "housekeep/housekeep") {
    if (role.dispatchId === null || role.routingPlanDigest === null || role.originEntry !== null) {
      context.addIssue({ code: "custom", path: ["dispatchId"], message: "Partial housekeep requires dispatch and plan digest only" });
    }
  } else if (role.dispatchId !== null || role.originEntry !== null || role.routingPlanDigest !== null) {
    context.addIssue({ code: "custom", path: ["dispatchId"], message: "Execution context is not stored for this role" });
  }
});

/** Verifiable process anchor. */
export const LocusProcessAnchorSchema = z.strictObject({
  kind: z.literal("process"),
  pid: z.number().int().positive(),
  startToken: LocusOpaqueTextSchema,
  inspector: LocusOpaqueTextSchema,
  selector: LocusOpaqueTextSchema,
});

/** Explicitly unverifiable session anchor. */
export const LocusUnverifiableAnchorSchema = z.strictObject({
  kind: z.literal("unverifiable"),
  reason: LocusOpaqueTextSchema,
});

/** Session anchor persisted with a lease or lock. */
export const LocusAnchorSchema = z.discriminatedUnion("kind", [
  LocusProcessAnchorSchema,
  LocusUnverifiableAnchorSchema,
]);

/** Session-scoped checkout lease. */
export const LocusLeaseSchema = z.strictObject({
  leaseId: LocusTokenSchema,
  sessionHomePath: LocusAbsolutePathSchema,
  anchor: LocusAnchorSchema,
  attachedAt: LocusTimestampSchema,
  heartbeatAt: LocusTimestampSchema,
});

/** Exact persisted record format. */
export const LocusRecordV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  recordId: LocusDigestSchema,
  checkoutPath: LocusAbsolutePathSchema,
  role: LocusRoleSchema,
  lease: LocusLeaseSchema.nullable(),
});

export type LocusRoleSubject = z.infer<typeof LocusRoleSubjectSchema>;
export type LocusRole = z.infer<typeof LocusRoleSchema>;
export type LocusProcessAnchor = z.infer<typeof LocusProcessAnchorSchema>;
export type LocusAnchor = z.infer<typeof LocusAnchorSchema>;
export type LocusLease = z.infer<typeof LocusLeaseSchema>;
export type LocusRecordV1 = z.infer<typeof LocusRecordV1Schema>;
