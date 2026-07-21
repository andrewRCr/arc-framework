/** Authority-derived locus role minting and expected-generation mutations. */

import { isDeepStrictEqual } from "node:util";

import type { LocusRecordReadResult } from "./record-store.js";
import {
  LocusIdentityV1Schema,
  LocusRecordV1Schema,
  LocusRoleSchema,
  type LocusIdentityV1,
  type LocusRecordV1,
  type LocusRole,
} from "./schema/index.js";

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

export type LocusRoleMintResult =
  | { readonly kind: "applied" | "idempotent"; readonly record: LocusRecordV1; readonly bytes: Buffer }
  | { readonly kind: "refused"; readonly reason: "role-conflict" | "record-malformed" };

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
  return parsed.success ? parsed.data : null;
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
