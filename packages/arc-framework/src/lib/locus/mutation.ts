/** Authority-derived locus role minting and expected-generation mutations. */

import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { LocusRecordReadResult } from "./record-store.js";
import {
  LocusIdentityV1Schema,
  LocusRecordV1Schema,
  LocusRoleSchema,
  type LocusIdentityV1,
  type LocusAnchor,
  type LocusRecordV1,
  type LocusRole,
} from "./schema/index.js";
import type { ProcessLiveness } from "./process-inspector.js";

export type LocusRoleAuthority =
  | { readonly kind: "work-unit"; readonly key: string }
  | { readonly kind: "identity"; readonly identity: LocusIdentityV1 }
  | {
      readonly kind: "partial-errand";
      readonly key: string;
      readonly originEntry: string | null;
      readonly dispatchId: string | null;
      readonly routingPlanDigest: null;
    }
  | {
      readonly kind: "partial-housekeep";
      readonly key: string;
      readonly originEntry: null;
      readonly dispatchId: string;
      readonly routingPlanDigest: string;
    };

export interface LocusRoleMintIO {
  read(): Promise<LocusRecordReadResult>;
  mint(record: LocusRecordV1): Promise<
    { kind: "created"; bytes: Buffer } | { kind: "exists" }
  >;
}

export interface LocusLeaseMutationIO {
  read(): Promise<LocusRecordReadResult>;
  replace(expectedBytes: Buffer, record: LocusRecordV1): Promise<
    { kind: "replaced"; bytes: Buffer } | { kind: "generation-mismatch" }
  >;
}

export type LocusRoleMintResult =
  | { readonly kind: "applied" | "idempotent"; readonly record: LocusRecordV1; readonly bytes: Buffer }
  | { readonly kind: "refused"; readonly reason: "role-conflict" | "record-malformed" };

export type LocusLeaseMutationResult =
  | { readonly kind: "applied" | "idempotent"; readonly record: LocusRecordV1; readonly bytes: Buffer }
  | {
      readonly kind: "refused";
      readonly reason:
        | "record-malformed"
        | "lease-live"
        | "lease-unknown"
        | "lease-generation-mismatch"
        | "role-conflict";
    };

/**
 * Mint one durable role from trusted authority facts, preserving exact replay semantics.
 * @param options - Directed record coordinates, authority evidence, timestamp, and record-store port.
 * @returns Applied/idempotent record generation or a typed refusal.
 */
export async function mintDurableLocusRole(options: {
  recordId: string;
  checkoutPath: string;
  parentCheckoutPath: string | null;
  establishedAt: string;
  authority: LocusRoleAuthority;
  io: LocusRoleMintIO;
}): Promise<LocusRoleMintResult> {
  const role = deriveRole(options.authority, options.parentCheckoutPath, options.establishedAt);
  if (role === null) return { kind: "refused", reason: "role-conflict" };
  const parsed = LocusRecordV1Schema.safeParse({
    schemaVersion: 1,
    recordId: options.recordId,
    checkoutPath: options.checkoutPath,
    role,
    lease: null,
  });
  if (!parsed.success) return { kind: "refused", reason: "role-conflict" };
  const expected = parsed.data;
  const initial = await options.io.read();
  if (initial.kind !== "absent") return existingResult(initial, expected);
  const minted = await options.io.mint(expected);
  if (minted.kind === "created") return { kind: "applied", record: expected, bytes: minted.bytes };
  return existingResult(await options.io.read(), expected);
}

/**
 * Attach one session lease without replacing live, unknown, or transient-dead ownership.
 * @param options - Expected record, session home, anchor, generation, liveness, and store port.
 * @returns Applied/idempotent lease generation or a typed refusal.
 */
export async function attachLocusLease(options: {
  recordId: string;
  sessionHomePath: string;
  anchor: LocusAnchor;
  leaseId?: string;
  attachedAt: string;
  heartbeatAt: string;
  observedLiveness: ProcessLiveness | null;
  io: LocusLeaseMutationIO;
}): Promise<LocusLeaseMutationResult> {
  const existing = await options.io.read();
  if (existing.kind !== "valid" || existing.record.recordId !== options.recordId) {
    return { kind: "refused", reason: "record-malformed" };
  }
  const leaseId = options.leaseId ?? randomBytes(16).toString("hex");
  const lease = existing.record.lease;
  if (lease !== null && lease.leaseId === leaseId && isDeepStrictEqual(lease.anchor, options.anchor)) {
    return { kind: "idempotent", record: existing.record, bytes: existing.bytes };
  }
  if (lease !== null) {
    if (options.observedLiveness === "live") return { kind: "refused", reason: "lease-live" };
    if (options.observedLiveness !== "dead") return { kind: "refused", reason: "lease-unknown" };
    if (existing.record.role.kind !== "work-unit") return { kind: "refused", reason: "role-conflict" };
  }
  const parsed = LocusRecordV1Schema.safeParse({
    ...existing.record,
    lease: {
      leaseId,
      sessionHomePath: options.sessionHomePath,
      anchor: options.anchor,
      attachedAt: options.attachedAt,
      heartbeatAt: options.heartbeatAt,
    },
  });
  if (!parsed.success) return { kind: "refused", reason: "record-malformed" };
  const replaced = await options.io.replace(existing.bytes, parsed.data);
  return replaced.kind === "replaced"
    ? { kind: "applied", record: parsed.data, bytes: replaced.bytes }
    : { kind: "refused", reason: "lease-generation-mismatch" };
}

/**
 * Refresh an exact lease generation only for a state-touching operation.
 * @param options - Expected record/lease generation, anchor, heartbeat, call class, and store port.
 * @returns Applied/idempotent heartbeat generation or a typed refusal.
 */
export async function refreshLocusLeaseHeartbeat(options: {
  recordId: string;
  leaseId: string;
  anchor: LocusAnchor;
  heartbeatAt: string;
  stateTouching: boolean;
  io: LocusLeaseMutationIO;
}): Promise<LocusLeaseMutationResult> {
  const existing = await options.io.read();
  if (existing.kind !== "valid" || existing.record.recordId !== options.recordId) {
    return { kind: "refused", reason: "record-malformed" };
  }
  const lease = existing.record.lease;
  if (lease === null
    || lease.leaseId !== options.leaseId
    || !isDeepStrictEqual(lease.anchor, options.anchor)) {
    return { kind: "refused", reason: "lease-generation-mismatch" };
  }
  if (!options.stateTouching || lease.heartbeatAt === options.heartbeatAt) {
    return { kind: "idempotent", record: existing.record, bytes: existing.bytes };
  }
  const parsed = LocusRecordV1Schema.safeParse({
    ...existing.record,
    lease: { ...lease, heartbeatAt: options.heartbeatAt },
  });
  if (!parsed.success) return { kind: "refused", reason: "record-malformed" };
  const replaced = await options.io.replace(existing.bytes, parsed.data);
  return replaced.kind === "replaced"
    ? { kind: "applied", record: parsed.data, bytes: replaced.bytes }
    : { kind: "refused", reason: "lease-generation-mismatch" };
}

/**
 * Release only one expected lease generation, preserving the durable role.
 * @param options - Directed record ID, expected lease token, and store port.
 * @returns Applied/idempotent cleared generation or a typed refusal.
 */
export async function releaseLocusLease(options: {
  recordId: string;
  leaseId: string;
  io: LocusLeaseMutationIO;
}): Promise<LocusLeaseMutationResult> {
  const existing = await options.io.read();
  if (existing.kind !== "valid" || existing.record.recordId !== options.recordId) {
    return { kind: "refused", reason: "record-malformed" };
  }
  if (existing.record.lease === null) {
    return { kind: "idempotent", record: existing.record, bytes: existing.bytes };
  }
  if (existing.record.lease.leaseId !== options.leaseId) {
    return { kind: "refused", reason: "lease-generation-mismatch" };
  }
  const next = { ...existing.record, lease: null };
  const replaced = await options.io.replace(existing.bytes, next);
  return replaced.kind === "replaced"
    ? { kind: "applied", record: next, bytes: replaced.bytes }
    : { kind: "refused", reason: "lease-generation-mismatch" };
}

/**
 * Replace a directed role or parent edge only from its exact prior role generation.
 * @param options - Target coordinates, expected role, next authority/parent, timestamp, and store port.
 * @returns Applied/idempotent role generation or a typed refusal.
 */
export async function updateLocusRole(options: {
  recordId: string;
  checkoutPath: string;
  expectedRole: LocusRole;
  authority: LocusRoleAuthority;
  parentCheckoutPath: string | null;
  establishedAt: string;
  io: LocusLeaseMutationIO;
}): Promise<LocusLeaseMutationResult> {
  const existing = await options.io.read();
  if (existing.kind !== "valid"
    || existing.record.recordId !== options.recordId
    || existing.record.checkoutPath !== options.checkoutPath) {
    return { kind: "refused", reason: "record-malformed" };
  }
  const desired = deriveRole(options.authority, options.parentCheckoutPath, options.establishedAt);
  if (desired === null) return { kind: "refused", reason: "role-conflict" };
  if (isDeepStrictEqual(existing.record.role, desired)) {
    return { kind: "idempotent", record: existing.record, bytes: existing.bytes };
  }
  if (!isDeepStrictEqual(existing.record.role, options.expectedRole)) {
    return { kind: "refused", reason: "role-conflict" };
  }
  const next = { ...existing.record, role: desired };
  const replaced = await options.io.replace(existing.bytes, next);
  return replaced.kind === "replaced"
    ? { kind: "applied", record: next, bytes: replaced.bytes }
    : { kind: "refused", reason: "role-conflict" };
}

function deriveRole(
  authority: LocusRoleAuthority,
  parentCheckoutPath: string | null,
  establishedAt: string,
): LocusRole | null {
  let candidate: unknown;
  if (authority.kind === "work-unit") {
    candidate = role("work-unit", "work-unit", authority.key, null, parentCheckoutPath, establishedAt);
  } else if (authority.kind === "identity") {
    const identity = LocusIdentityV1Schema.safeParse(authority.identity);
    if (!identity.success) return null;
    if (identity.data.kind === "groom") {
      candidate = role(
        "groom", "groom", identity.data.key, identity.data.claimId, parentCheckoutPath, establishedAt,
      );
    } else {
      const roleKind = identity.data.purpose === "housekeep-routing" ? "housekeep" : "errand";
      candidate = role(
        roleKind, "errand", identity.data.key, identity.data.claimId, parentCheckoutPath, establishedAt,
      );
    }
  } else if (authority.kind === "partial-errand") {
    candidate = role(
      "errand",
      "partial-errand",
      authority.key,
      null,
      parentCheckoutPath,
      establishedAt,
      authority.dispatchId,
      authority.originEntry,
      authority.routingPlanDigest,
    );
  } else {
    candidate = role(
      "housekeep",
      "housekeep",
      authority.key,
      null,
      parentCheckoutPath,
      establishedAt,
      authority.dispatchId,
      authority.originEntry,
      authority.routingPlanDigest,
    );
  }
  const parsed = LocusRoleSchema.safeParse(candidate);
  return parsed.success && !(parsed.data.kind === "work-unit" && parsed.data.parentCheckoutPath !== null)
    ? parsed.data
    : null;
}

function role(
  kind: string,
  subjectKind: string,
  key: string,
  claimId: string | null,
  parentCheckoutPath: string | null,
  establishedAt: string,
  dispatchId: string | null = null,
  originEntry: string | null = null,
  routingPlanDigest: string | null = null,
): unknown {
  return {
    kind,
    subject: { kind: subjectKind, key, claimId },
    establishedAt,
    parentCheckoutPath,
    dispatchId,
    originEntry,
    routingPlanDigest,
  };
}

function existingResult(
  existing: LocusRecordReadResult,
  expected: LocusRecordV1,
): LocusRoleMintResult {
  if (existing.kind !== "valid") return { kind: "refused", reason: "record-malformed" };
  const sameTarget = existing.record.recordId === expected.recordId
    && existing.record.checkoutPath === expected.checkoutPath;
  if (!sameTarget || !isDeepStrictEqual(existing.record.role, expected.role)) {
    return { kind: "refused", reason: "role-conflict" };
  }
  return { kind: "idempotent", record: existing.record, bytes: existing.bytes };
}
