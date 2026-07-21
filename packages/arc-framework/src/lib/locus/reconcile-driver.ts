/** Proof-revalidated application of one local locus reconciliation action. */

import { isDeepStrictEqual } from "node:util";

import { mintDurableLocusRole } from "./mutation.js";
import type {
  LocusInternalReconcileAction,
  LocusLockGenerationProof,
  LocusReconciliationPlan,
  LocusTransientAdoptionEvidence,
  LocusTransientAuthorityRecheck,
} from "./reconciliation.js";
import type { LocusRecordReadResult } from "./record-store.js";
import type { LocusRecordV1 } from "./schema/index.js";

export interface LocusOwnedRecordLock {
  readonly recordId: string;
  readonly token: string;
}

export interface LocusReconcileDriverIO {
  readPlan(): Promise<LocusReconciliationPlan>;
  acquireRecordLock(recordId: string): Promise<
    { kind: "acquired"; handle: LocusOwnedRecordLock }
    | { kind: "refused"; reason: "live" | "unknown" }
  >;
  releaseRecordLock(handle: LocusOwnedRecordLock): Promise<void>;
  readRecord(path: string, handle: LocusOwnedRecordLock): Promise<LocusRecordReadResult>;
  mintRecord(
    path: string,
    record: LocusRecordV1,
    handle: LocusOwnedRecordLock,
  ): Promise<{ kind: "created"; bytes: Buffer } | { kind: "exists" }>;
  removeRecord(
    path: string,
    expectedBytes: Buffer,
    handle: LocusOwnedRecordLock,
  ): Promise<{ kind: "removed" } | { kind: "generation-mismatch" }>;
  verifyWorkUnitAuthority(action: LocusInternalReconcileAction, handle: LocusOwnedRecordLock): Promise<boolean>;
  /** Re-read marker, roster, and identity authority locally while the record lock is owned. */
  recheckTransientAuthority(
    action: LocusInternalReconcileAction,
    handle: LocusOwnedRecordLock,
  ): Promise<LocusTransientAuthorityRecheck>;
  breakDeadLock(proof: LocusLockGenerationProof): Promise<
    { kind: "broken" | "already-absent" | "generation-mismatch" | "live" | "unknown" }
  >;
}

export type LocusReconcileApplyResult =
  | { readonly kind: "applied" | "idempotent" }
  | {
      readonly kind: "refused";
      readonly reason:
        | "action-changed"
        | "plan-stopped"
        | "action-unsupported"
        | "authority-changed"
        | "generation-mismatch"
        | "lock-live"
        | "lock-unknown";
      readonly evidence?: LocusTransientAdoptionEvidence;
    };

/**
 * Rerun the reader and apply exactly one unchanged proof-bearing reconciliation action.
 * @param options - Previously selected action, mint timestamp, and owned-lock I/O boundary.
 * @returns Applied/idempotent completion or a fail-closed refusal.
 */
export async function applyLocusReconciliationAction(options: {
  expected: LocusInternalReconcileAction;
  establishedAt: string;
  io: LocusReconcileDriverIO;
}): Promise<LocusReconcileApplyResult> {
  const plan = await options.io.readPlan();
  if (plan.reconciliation.kind === "stop") return { kind: "refused", reason: "plan-stopped" };
  const action = plan.internalActions.find((candidate) => isDeepStrictEqual(candidate, options.expected));
  if (action === undefined) return { kind: "refused", reason: "action-changed" };
  if (action.proof.kind === "lock-present") return applyDeadLock(action.proof, options.io);
  const recordId = action.summary.recordId;
  if (recordId === null) return { kind: "refused", reason: "action-changed" };
  const acquired = await options.io.acquireRecordLock(recordId);
  if (acquired.kind === "refused") {
    return { kind: "refused", reason: acquired.reason === "live" ? "lock-live" : "lock-unknown" };
  }
  try {
    if (action.summary.kind === "adopt-work-unit") {
      return await applyWorkUnitAdoption(action, options.establishedAt, acquired.handle, options.io);
    }
    if (action.summary.kind === "adopt-transient") {
      return await applyTransientAdoption(action, options.establishedAt, acquired.handle, options.io);
    }
    if (action.summary.kind === "reap-stale-record") {
      return await applyStaleRecordReap(action, acquired.handle, options.io);
    }
    return { kind: "refused", reason: "action-unsupported" };
  } finally {
    await options.io.releaseRecordLock(acquired.handle);
  }
}

async function applyWorkUnitAdoption(
  action: LocusInternalReconcileAction,
  establishedAt: string,
  handle: LocusOwnedRecordLock,
  io: LocusReconcileDriverIO,
): Promise<LocusReconcileApplyResult> {
  if (action.summary.checkoutPath === null
    || action.summary.recordId === null
    || action.proof.kind !== "record-absent"
    || action.authority === null
    || action.authority.kind !== "work-unit") {
    return { kind: "refused", reason: "action-changed" };
  }
  if (!await io.verifyWorkUnitAuthority(action, handle)) {
    return { kind: "refused", reason: "authority-changed" };
  }
  const result = await mintDurableLocusRole({
    recordId: action.summary.recordId,
    checkoutPath: action.summary.checkoutPath,
    parentCheckoutPath: null,
    establishedAt,
    authority: { kind: "work-unit", key: action.authority.subjectKey },
    io: {
      read: () => io.readRecord(action.proof.path, handle),
      mint: (record) => io.mintRecord(action.proof.path, record, handle),
    },
  });
  if (result.kind === "refused") {
    return {
      kind: "refused",
      reason: result.reason === "role-conflict" ? "authority-changed" : "generation-mismatch",
    };
  }
  return { kind: result.kind };
}

async function applyTransientAdoption(
  action: LocusInternalReconcileAction,
  establishedAt: string,
  handle: LocusOwnedRecordLock,
  io: LocusReconcileDriverIO,
): Promise<LocusReconcileApplyResult> {
  if (action.summary.checkoutPath === null
    || action.summary.recordId === null
    || action.proof.kind !== "record-absent"
    || action.authority?.kind !== "transient") {
    return { kind: "refused", reason: "action-changed" };
  }
  const recheck = await io.recheckTransientAuthority(action, handle);
  if (recheck.kind === "changed") {
    return { kind: "refused", reason: "authority-changed", evidence: recheck.evidence };
  }
  if (!isDeepStrictEqual(recheck.authority, action.authority)) {
    return {
      kind: "refused",
      reason: "authority-changed",
      evidence: {
        kind: "marker-record-mismatch",
        markerBytes: recheck.authority.marker.bytes,
        recordBytes: null,
      },
    };
  }
  const result = await mintDurableLocusRole({
    recordId: action.summary.recordId,
    checkoutPath: action.summary.checkoutPath,
    parentCheckoutPath: null,
    establishedAt,
    authority: { kind: "identity", identity: action.authority.identity },
    io: {
      read: () => io.readRecord(action.proof.path, handle),
      mint: (record) => io.mintRecord(action.proof.path, record, handle),
    },
  });
  if (result.kind === "refused") {
    const current = await io.readRecord(action.proof.path, handle);
    return {
      kind: "refused",
      reason: result.reason === "role-conflict" ? "authority-changed" : "generation-mismatch",
      evidence: {
        kind: "marker-record-mismatch",
        markerBytes: action.authority.marker.bytes,
        recordBytes: current.kind === "valid" ? current.bytes : null,
      },
    };
  }
  return { kind: result.kind };
}

async function applyStaleRecordReap(
  action: LocusInternalReconcileAction,
  handle: LocusOwnedRecordLock,
  io: LocusReconcileDriverIO,
): Promise<LocusReconcileApplyResult> {
  if (action.proof.kind !== "record-present") return { kind: "refused", reason: "action-changed" };
  const current = await io.readRecord(action.proof.path, handle);
  if (current.kind === "absent") return { kind: "idempotent" };
  if (current.kind !== "valid" || !current.bytes.equals(action.proof.bytes)) {
    return { kind: "refused", reason: "generation-mismatch" };
  }
  const removed = await io.removeRecord(action.proof.path, action.proof.bytes, handle);
  return removed.kind === "removed"
    ? { kind: "applied" }
    : { kind: "refused", reason: "generation-mismatch" };
}

async function applyDeadLock(
  proof: LocusLockGenerationProof,
  io: LocusReconcileDriverIO,
): Promise<LocusReconcileApplyResult> {
  const result = await io.breakDeadLock(proof);
  if (result.kind === "broken") return { kind: "applied" };
  if (result.kind === "already-absent") return { kind: "idempotent" };
  if (result.kind === "live") return { kind: "refused", reason: "lock-live" };
  if (result.kind === "unknown") return { kind: "refused", reason: "lock-unknown" };
  return { kind: "refused", reason: "generation-mismatch" };
}
