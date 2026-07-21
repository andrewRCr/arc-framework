/** Recoverable composition of transient checkout, marker, role, and lease generations. */

import type { LinkedWorktreeCreationReceipt } from "../git/linked-worktree.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import {
  attachLocusLease,
  mintDurableLocusRole,
  type LocusRoleAuthority,
} from "./mutation.js";
import { resolveProvisioningAuthority } from "./provisioning-authority.js";
import { establishReadyMarker, transientMarkerSubject } from "./provisioning-marker.js";
import type {
  PrimaryCheckoutReceipt,
  ProvisioningEvidence,
  ProvisioningRecordLock,
  ProvisioningRefusalReason,
  ProvisionTransientLocusOptions,
  ProvisionTransientLocusResult,
} from "./provisioning-types.js";
import type { LocusRecordV1 } from "./schema/index.js";

export type {
  PrimaryCheckoutReceipt,
  ProvisioningEvidence,
  ProvisioningMarkerReadResult,
  ProvisioningRecordLock,
  ProvisioningRefusalReason,
  ProvisionTransientLocusDependencies,
  ProvisionTransientLocusOptions,
  ProvisionTransientLocusResult,
  TransientProvisioningReceipt,
} from "./provisioning-types.js";

interface SpawnState {
  readonly checkoutPath: string;
  readonly rosterHead: string;
  readonly creation: LinkedWorktreeCreationReceipt | null;
  readonly marker: { marker: WorktreeMarker; bytes: Buffer; owned: boolean };
}

/**
 * Compose one already-claimed transient identity into a local role and entering lease.
 * @param options - Allocation proof, local transaction inputs, and owned-generation I/O.
 * @returns A proof-bearing receipt or reconciliation evidence for every incomplete state.
 */
export async function provisionTransientLocus(
  options: ProvisionTransientLocusOptions,
): Promise<ProvisionTransientLocusResult> {
  const authority = resolveProvisioningAuthority(options);
  if (authority === null) return refused("identity-conflict", { kind: "identity-only" });
  if (options.proposal.allocation.kind === "spawn") {
    if (options.protection !== "full") {
      return refused("full-protection-required", { kind: "identity-only" });
    }
    return provisionSpawned(options, authority);
  }
  return provisionPrimary(options, authority);
}

async function provisionSpawned(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
): Promise<ProvisionTransientLocusResult> {
  const subject = transientMarkerSubject(options.proposal);
  if (subject === null || options.branch === null) {
    return refused("identity-conflict", { kind: "identity-only" });
  }
  let created: LinkedWorktreeCreationReceipt | null = null;
  let checkoutPath: string;
  try {
    const creation = await options.dependencies.createLinkedWorktree({
      locationTemplate: options.locationTemplate,
      primaryWorktreePath: options.proposal.allocation.kind === "spawn"
        ? options.proposal.allocation.primaryPath
        : undefined,
      repo: options.repo,
      placementName: `locus-${subject.kind}-${subject.slug}-${subject.claimId}`,
      branch: options.branch,
      createBranch: options.expectedBranchHead === null,
      base: options.base,
    });
    if (creation.kind === "error") return failure(creation.error, { kind: "identity-only" });
    if (creation.kind === "refused") checkoutPath = creation.worktreePath;
    else {
      created = creation.receipt;
      checkoutPath = creation.receipt.worktreePath;
    }
  } catch (error) {
    return failure(error, { kind: "identity-only" });
  }

  const topology = await safeCall(() => options.dependencies.scanWorktrees());
  if (topology.kind === "error") {
    return rollbackSpawnFailure(options, created, null, toError(topology.error));
  }
  if (!topology.value.ok) {
    return rollbackSpawnFailure(options, created, null, toError(topology.value.message));
  }
  const roster = topology.value.worktrees.find((worktree) =>
    worktree.path === checkoutPath
    && worktree.branch === options.branch
    && !worktree.detached);
  if (roster === undefined) {
    return rollbackSpawnRefusal(options, created, null, "topology-unknown");
  }
  if (options.expectedBranchHead !== null && roster.head !== options.expectedBranchHead) {
    return rollbackSpawnRefusal(options, created, roster.head, "identity-conflict");
  }

  const marker = await establishReadyMarker(options, checkoutPath, subject);
  if (marker.kind !== "ready") {
    if (marker.kind === "error") {
      return rollbackSpawnFailure(options, created, roster.head, marker.error, marker.rollback);
    }
    return refused(marker.reason, marker.evidence);
  }

  const spawn: SpawnState = {
    checkoutPath,
    rosterHead: roster.head,
    creation: created,
    marker: marker.value,
  };
  const result = await provisionRecord(options, authority, spawn, null);
  if (!canRollbackSpawnedRecordFailure(result, spawn)) return result;
  const evidence = await rollbackSpawn(options, spawn.creation, spawn.rosterHead, {
    markerBytes: spawn.marker.bytes,
    markerOwned: true,
    checkoutPath: spawn.checkoutPath,
  });
  if (result.kind === "refused") return { ...result, evidence };
  if (result.kind === "error") return { ...result, evidence };
  return result;
}

async function provisionPrimary(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
): Promise<ProvisionTransientLocusResult> {
  const checkoutPath = options.proposal.allocation.kind === "primary"
    ? options.proposal.allocation.checkoutPath
    : "";
  const acquired = await acquire(options, checkoutPath);
  if (acquired.kind !== "acquired") return acquired.result;
  const result = await provisionPrimaryUnderLock(options, authority, checkoutPath, acquired.handle);
  const released = await safeCall(() => options.dependencies.releaseRecordLock(acquired.handle));
  if (released.kind === "value") return result;
  const recordBytes = result.kind === "provisioned"
    ? result.receipt.record.bytes
    : result.evidence.kind === "marker-record-mismatch" ? result.evidence.recordBytes : null;
  return failure(released.error, {
    kind: "marker-record-mismatch",
    checkoutPath,
    markerBytes: null,
    recordBytes,
  });
}

async function provisionPrimaryUnderLock(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
  checkoutPath: string,
  handle: ProvisioningRecordLock,
): Promise<ProvisionTransientLocusResult> {
  let checkout: PrimaryCheckoutReceipt | null = null;
  try {
    const fresh = await options.dependencies.revalidateTarget({
      proposal: options.proposal,
      checkoutPath,
      handle,
    });
    if (fresh.kind === "refused") return refused(fresh.reason, { kind: "identity-only" });
    checkout = await options.dependencies.checkoutPrimary(
      checkoutPath,
      options.branch,
      options.expectedBranchHead,
    );
    const result = await provisionRecord(options, authority, null, { checkout, lock: handle });
    if (result.kind === "provisioned") return result;
    const expectedCheckout = checkout;
    const rolledBack = await safeCall(() =>
      options.dependencies.rollbackPrimary(checkoutPath, expectedCheckout));
    if (rolledBack.kind === "value" && rolledBack.value.kind === "rolled-back") return result;
    const evidence = {
      kind: "marker-record-mismatch" as const,
      checkoutPath,
      markerBytes: null,
      recordBytes: null,
    };
    if (result.kind === "error") return { ...result, evidence };
    return { ...result, evidence };
  } catch (error) {
    if (checkout !== null) {
      const expectedCheckout = checkout;
      const rolledBack = await safeCall(() =>
        options.dependencies.rollbackPrimary(checkoutPath, expectedCheckout));
      if (rolledBack.kind === "error" || rolledBack.value.kind !== "rolled-back") {
        return failure(error, {
          kind: "marker-record-mismatch",
          checkoutPath,
          markerBytes: null,
          recordBytes: null,
        });
      }
    }
    return failure(error, { kind: "identity-only" });
  }
}

async function provisionRecord(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
  spawn: SpawnState | null,
  primary: { checkout: PrimaryCheckoutReceipt; lock: ProvisioningRecordLock } | null,
): Promise<ProvisionTransientLocusResult> {
  const checkoutPath = spawn?.checkoutPath
    ?? (options.proposal.allocation.kind === "primary" ? options.proposal.allocation.checkoutPath : "");
  let handle = primary?.lock;
  if (handle === undefined) {
    const acquired = await acquire(options, checkoutPath);
    if (acquired.kind !== "acquired") return acquired.result;
    handle = acquired.handle;
    const fresh = await safeCall(() => options.dependencies.revalidateTarget({
      proposal: options.proposal,
      checkoutPath,
      handle: acquired.handle,
    }));
    if (fresh.kind === "error") {
      const released = await safeCall(() => options.dependencies.releaseRecordLock(acquired.handle));
      return failure(released.kind === "error" ? released.error : fresh.error, evidenceFor(spawn, null));
    }
    if (fresh.value.kind === "refused") {
      const released = await safeCall(() => options.dependencies.releaseRecordLock(acquired.handle));
      return released.kind === "error"
        ? failure(released.error, evidenceFor(spawn, null))
        : refused(fresh.value.reason, evidenceFor(spawn, null));
    }
  }

  const result = await applyRecordGeneration(options, authority, spawn, primary, checkoutPath, handle);
  if (primary !== null) return result;
  const released = await safeCall(() => options.dependencies.releaseRecordLock(handle));
  if (released.kind === "value") return result;
  const recordBytes = result.kind === "provisioned"
    ? result.receipt.record.bytes
    : result.evidence.kind === "marker-record-mismatch" ? result.evidence.recordBytes : null;
  return failure(released.error, evidenceFor(spawn, recordBytes, checkoutPath));
}

async function applyRecordGeneration(
  options: ProvisionTransientLocusOptions,
  authority: LocusRoleAuthority,
  spawn: SpawnState | null,
  primary: { checkout: PrimaryCheckoutReceipt; lock: ProvisioningRecordLock } | null,
  checkoutPath: string,
  lock: ProvisioningRecordLock,
): Promise<ProvisionTransientLocusResult> {
  let mintedBytes: Buffer | null = null;
  const checkoutHead = spawn?.rosterHead ?? primary?.checkout.head;
  if (checkoutHead === undefined) {
    return failure(new Error("Provisioning target has no checkout-head proof"), evidenceFor(spawn, null));
  }
  const recordIO = {
    read: () => options.dependencies.readRecord(lock.recordPath, lock),
    mint: (record: LocusRecordV1) => options.dependencies.mintRecord(lock.recordPath, record, lock),
    replace: (expectedBytes: Buffer, record: LocusRecordV1) =>
      options.dependencies.replaceRecord(lock.recordPath, expectedBytes, record, lock),
  };
  try {
    const role = await mintDurableLocusRole({
      recordId: lock.recordId,
      checkoutPath,
      parentCheckoutPath: options.parentCheckoutPath,
      establishedAt: options.establishedAt,
      authority,
      io: recordIO,
    });
    if (role.kind === "refused") {
      const conflict = await recordIO.read();
      return refused(
        role.reason,
        evidenceFor(spawn, conflict.kind === "valid" ? conflict.bytes : null, checkoutPath),
      );
    }
    if (role.kind === "applied") mintedBytes = role.bytes;
    const lease = await attachLocusLease({
      recordId: lock.recordId,
      sessionHomePath: options.sessionHomePath,
      anchor: options.anchor,
      leaseId: options.leaseId,
      attachedAt: options.establishedAt,
      heartbeatAt: options.establishedAt,
      observedLiveness: null,
      io: recordIO,
    });
    if (lease.kind === "refused") {
      if (mintedBytes !== null) {
        const removed = await options.dependencies.removeRecord(lock.recordPath, mintedBytes, lock);
        if (removed.kind !== "removed") {
          return refused(lease.reason, evidenceFor(spawn, mintedBytes, checkoutPath));
        }
        mintedBytes = null;
      }
      return refused(lease.reason, evidenceFor(spawn, null, checkoutPath));
    }
    return {
      kind: "provisioned",
      receipt: {
        allocation: spawn === null ? "primary" : "spawned",
        checkoutPath,
        branch: {
          name: options.branch,
          created: spawn?.creation?.branchCreated ?? primary?.checkout.branchCreated ?? false,
          head: checkoutHead,
          base: spawn?.creation?.base ?? null,
        },
        worktree: {
          path: checkoutPath,
          created: spawn?.creation !== null && spawn !== null,
          head: checkoutHead,
        },
        marker: spawn === null ? null : { state: "ready", bytes: spawn.marker.bytes },
        record: { recordId: lock.recordId, bytes: lease.bytes },
        leaseToken: options.leaseId,
      },
    };
  } catch (error) {
    if (mintedBytes !== null) {
      const ownedBytes = mintedBytes;
      const removed = await safeCall(() =>
        options.dependencies.removeRecord(lock.recordPath, ownedBytes, lock));
      if (removed.kind === "error" || removed.value.kind !== "removed") {
        return failure(error, evidenceFor(spawn, mintedBytes, checkoutPath));
      }
    }
    return failure(error, evidenceFor(spawn, null, checkoutPath));
  }
}

async function acquire(
  options: ProvisionTransientLocusOptions,
  checkoutPath: string,
): Promise<
  { kind: "acquired"; handle: ProvisioningRecordLock }
  | { kind: "returned"; result: ProvisionTransientLocusResult }
> {
  try {
    const acquired = await options.dependencies.acquireRecordLock(checkoutPath);
    if (acquired.kind === "acquired") return acquired;
    return {
      kind: "returned",
      result: refused(acquired.reason === "live" ? "lock-live" : "lock-unknown", { kind: "identity-only" }),
    };
  } catch (error) {
    return { kind: "returned", result: failure(error, { kind: "identity-only" }) };
  }
}

async function rollbackSpawnFailure(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  error: Error,
  markerRollback: { markerBytes: Buffer; markerOwned: boolean; checkoutPath: string } | null = null,
): Promise<ProvisionTransientLocusResult> {
  const rollback = await rollbackSpawn(options, creation, rosterHead, markerRollback);
  return failure(error, rollback);
}

async function rollbackSpawnRefusal(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  reason: ProvisioningRefusalReason,
): Promise<ProvisionTransientLocusResult> {
  return refused(reason, await rollbackSpawn(options, creation, rosterHead, null));
}

async function rollbackSpawn(
  options: ProvisionTransientLocusOptions,
  creation: LinkedWorktreeCreationReceipt | null,
  rosterHead: string | null,
  markerRollback: { markerBytes: Buffer; markerOwned: boolean; checkoutPath: string } | null,
): Promise<ProvisioningEvidence> {
  if (markerRollback !== null) {
    if (!markerRollback.markerOwned) {
      return {
        kind: "pending-marker",
        checkoutPath: markerRollback.checkoutPath,
        markerBytes: markerRollback.markerBytes,
      };
    }
    const removed = await safeCall(() =>
      options.dependencies.removeMarker(markerRollback.checkoutPath, markerRollback.markerBytes));
    if (removed.kind === "error" || removed.value.kind !== "removed") {
      return {
        kind: "marker-record-mismatch",
        checkoutPath: markerRollback.checkoutPath,
        markerBytes: markerRollback.markerBytes,
        recordBytes: null,
      };
    }
  }
  if (creation !== null && rosterHead !== null) {
    const rolledBack = await safeCall(() => options.dependencies.rollbackSpawned(creation, rosterHead));
    if (rolledBack.kind === "error" || rolledBack.value.kind !== "rolled-back") {
      return {
        kind: "marker-record-mismatch",
        checkoutPath: creation.worktreePath,
        markerBytes: null,
        recordBytes: null,
      };
    }
  }
  if (creation !== null && rosterHead === null) {
    return {
      kind: "marker-record-mismatch",
      checkoutPath: creation.worktreePath,
      markerBytes: null,
      recordBytes: null,
    };
  }
  return { kind: "identity-only" };
}

function evidenceFor(
  spawn: SpawnState | null,
  recordBytes: Buffer | null,
  checkoutPath = "",
): ProvisioningEvidence {
  if (spawn === null) {
    return recordBytes === null
      ? { kind: "identity-only" }
      : {
          kind: "marker-record-mismatch",
          checkoutPath,
          markerBytes: null,
          recordBytes,
        };
  }
  return {
    kind: "marker-record-mismatch",
    checkoutPath: spawn.checkoutPath,
    markerBytes: spawn.marker.bytes,
    recordBytes,
  };
}

function canRollbackSpawnedRecordFailure(
  result: ProvisionTransientLocusResult,
  spawn: SpawnState,
): boolean {
  if (!spawn.marker.owned || result.kind === "provisioned") return false;
  if (result.evidence.kind !== "marker-record-mismatch" || result.evidence.recordBytes !== null) return false;
  return result.kind === "error" || ![
    "role-conflict",
    "record-malformed",
    "lease-live",
    "lease-unknown",
  ].includes(result.reason);
}

function refused(reason: ProvisioningRefusalReason, evidence: ProvisioningEvidence): ProvisionTransientLocusResult {
  return { kind: "refused", reason, evidence };
}

function failure(error: unknown, evidence: ProvisioningEvidence): ProvisionTransientLocusResult {
  return { kind: "error", error: toError(error), evidence };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function safeCall<Value>(run: () => Promise<Value>): Promise<
  { kind: "value"; value: Value } | { kind: "error"; error: unknown }
> {
  try {
    return { kind: "value", value: await run() };
  } catch (error) {
    return { kind: "error", error };
  }
}
