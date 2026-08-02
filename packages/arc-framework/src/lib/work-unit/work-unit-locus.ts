/** Work-unit checkout role minting at trusted lifecycle composition sites. */

import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktree,
} from "../git/worktree-roster.js";
import { canonicalLocalPath } from "../local-path-identity.js";
import { acquireLocusLock, releaseLocusLock } from "../locus/lock.js";
import { attachLocusLease, mintDurableLocusRole, releaseLocusLease } from "../locus/mutation.js";
import { deriveLocusRecordId } from "../locus/path-identity.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor, verifyProcessAnchor } from "../locus/process-inspector.js";
import {
  mintLocusRecord,
  readLocusRecord,
  removeLocusRecord,
  replaceLocusRecord,
} from "../locus/record-store.js";
import { locusLockPath, locusRecordPath, resolveLocusRoot } from "../locus/root.js";
import type { LocusAnchor, LocusProcessAnchor } from "../locus/schema/index.js";

export interface ReconcileWorkUnitLocusOptions {
  readonly checkoutPath: string;
  readonly branch: string;
  readonly wuName: string;
  readonly attachSession: boolean;
  readonly establishedAt?: string;
}

export interface WorkUnitLocusReceipt {
  readonly recordId: string;
  readonly leaseId: string | null;
  readonly roleCreated: boolean;
}

export interface RetireWorkUnitLocusOptions {
  readonly checkoutPath: string;
  readonly wuName: string;
  readonly removeCheckout: () => Promise<void>;
}

export interface RetireWorkUnitLocusReceipt {
  readonly recordId: string;
  readonly roleRemoved: boolean;
}

export interface WorkUnitLocusDriver {
  reconcile(options: ReconcileWorkUnitLocusOptions): Promise<WorkUnitLocusReceipt>;
  retire?(options: RetireWorkUnitLocusOptions): Promise<RetireWorkUnitLocusReceipt>;
}

/** Bind WU role composition to the machine-local locus store. */
export function createNodeWorkUnitLocusDriver(options: {
  readonly exec: GitExec;
  readonly identity: string;
  /** Exact command/session anchor override for deterministic runtime tests. */
  readonly mutationAnchor?: LocusProcessAnchor;
}): WorkUnitLocusDriver {
  return {
    reconcile: (request) => reconcileNodeWorkUnitLocus(options, request),
    retire: (request) => retireNodeWorkUnitLocus(options, request),
  };
}

async function retireNodeWorkUnitLocus(
  runtime: { readonly exec: GitExec; readonly identity: string; readonly mutationAnchor?: LocusProcessAnchor },
  options: RetireWorkUnitLocusOptions,
): Promise<RetireWorkUnitLocusReceipt> {
  const checkoutPath = resolve(options.checkoutPath);
  const topology = await scanRegisteredWorktrees(runtime.exec);
  if (!topology.ok) throw new Error(`cannot retire work-unit session locus: ${topology.message}`);
  const matches = topology.worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath);
  if (matches.length !== 1) throw new Error("cannot retire work-unit session locus: target is not an exact live roster entry");
  const inspector = createPlatformProcessInspector();
  const anchor = runtime.mutationAnchor
    ?? await selectMutationAnchor(false, inspector, "cannot retire work-unit session locus");
  const root = await resolveLocusRoot({ identity: runtime.identity, scan: () => Promise.resolve(topology) });
  if (!root.ok) throw new Error(`cannot retire work-unit session locus: ${root.message}`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const identity = deriveLocusRecordId(checkoutPath, pathFlavor);
  const recordPath = locusRecordPath(root, identity.digest);
  const acquired = await acquireLocusLock({
    path: locusLockPath(root, identity.digest),
    anchor,
    inspector,
  });
  if (acquired.kind !== "acquired") throw new Error(`cannot retire work-unit session locus: record lock is ${acquired.reason}`);

  const applyUnderLock = async (): Promise<RetireWorkUnitLocusReceipt> => {
    const freshTopology = await scanRegisteredWorktrees(runtime.exec);
    if (!freshTopology.ok
      || freshTopology.worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath).length !== 1) {
      throw new Error("cannot retire work-unit session locus: target roster generation changed under lock");
    }
    const current = await readLocusRecord({ path: recordPath, expectedDigest: identity.digest, pathFlavor });
    if (current.kind === "absent") {
      await options.removeCheckout();
      return { recordId: identity.recordId, roleRemoved: false };
    }
    if (current.kind !== "valid"
      || current.record.recordId !== identity.recordId
      || current.record.checkoutPath !== checkoutPath
      || current.record.role.kind !== "work-unit"
      || current.record.role.subject.kind !== "work-unit"
      || current.record.role.subject.key !== options.wuName
      || current.record.role.subject.claimId !== null) {
      throw new Error("cannot retire work-unit session locus: role generation does not match the target work unit");
    }
    const lease = current.record.lease;
    if (lease !== null) {
      const sameAnchor = anchor.kind === "process"
        && lease.anchor.kind === "process"
        && lease.anchor.pid === anchor.pid
        && lease.anchor.startToken === anchor.startToken
        && lease.anchor.inspector === anchor.inspector;
      if (!sameAnchor) {
        const liveness = lease.anchor.kind === "process"
          ? await verifyProcessAnchor(lease.anchor, inspector)
          : "unknown";
        if (liveness !== "dead") throw new Error(`cannot retire work-unit session locus: lease is ${liveness}`);
      }
    }
    await options.removeCheckout();
    const removed = await removeLocusRecord({
      path: recordPath,
      expectedBytes: current.bytes,
      lock: acquired.handle,
    });
    if (removed.kind !== "removed") {
      throw new Error("cannot retire work-unit session locus: role generation changed before pop");
    }
    return { recordId: identity.recordId, roleRemoved: true };
  };
  let result: RetireWorkUnitLocusReceipt;
  try {
    result = await applyUnderLock();
  } catch (error) {
    await releaseLocusLock(acquired.handle);
    throw error;
  }
  const released = await releaseLocusLock(acquired.handle);
  if (released.kind !== "released") throw new Error(`cannot release work-unit session locus lock: ${released.kind}`);
  return result;
}

async function reconcileNodeWorkUnitLocus(
  runtime: { readonly exec: GitExec; readonly identity: string; readonly mutationAnchor?: LocusProcessAnchor },
  options: ReconcileWorkUnitLocusOptions,
): Promise<WorkUnitLocusReceipt> {
  const topology = await scanRegisteredWorktrees(runtime.exec);
  if (!topology.ok) throw new Error(`cannot establish work-unit session locus: ${topology.message}`);
  const checkoutIdentity = await canonicalLocalPath(options.checkoutPath);
  const matches = await matchingRegisteredWorktrees(topology.worktrees, checkoutIdentity);
  const target = matches.length === 1 ? matches[0] : undefined;
  if (target === undefined || target.detached || target.branch !== options.branch) {
    throw new Error("cannot establish work-unit session locus: target is not an exact live worktree roster entry");
  }
  const checkoutPath = resolve(target.path);

  const inspector = createPlatformProcessInspector();
  const anchor = runtime.mutationAnchor
    ?? await selectMutationAnchor(options.attachSession, inspector, "cannot establish work-unit session locus");
  const root = await resolveLocusRoot({ identity: runtime.identity, scan: () => Promise.resolve(topology) });
  if (!root.ok) throw new Error(`cannot establish work-unit session locus: ${root.message}`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const identity = deriveLocusRecordId(checkoutPath, pathFlavor);
  const recordPath = locusRecordPath(root, identity.digest);
  const acquired = await acquireLocusLock({
    path: locusLockPath(root, identity.digest),
    anchor,
    inspector,
  });
  if (acquired.kind !== "acquired") {
    throw new Error(`cannot establish work-unit session locus: record lock is ${acquired.reason}`);
  }

  const applyUnderLock = async (): Promise<WorkUnitLocusReceipt> => {
    const freshTopology = await scanRegisteredWorktrees(runtime.exec);
    if (!freshTopology.ok) throw new Error(`cannot establish work-unit session locus: ${freshTopology.message}`);
    const freshMatches = await matchingRegisteredWorktrees(freshTopology.worktrees, checkoutIdentity);
    const freshTarget = freshMatches.length === 1 ? freshMatches[0] : undefined;
    if (freshTarget === undefined || freshTarget.detached || freshTarget.branch !== options.branch) {
      throw new Error("cannot establish work-unit session locus: target roster generation changed under lock");
    }
    const io = {
      read: () => readLocusRecord({
        path: recordPath,
        expectedDigest: identity.digest,
        pathFlavor,
      }),
      mint: (record: Parameters<typeof mintLocusRecord>[0]["record"]) =>
        mintLocusRecord({ path: recordPath, record, lock: acquired.handle }),
      replace: (expectedBytes: Buffer, record: Parameters<typeof replaceLocusRecord>[0]["record"]) =>
        replaceLocusRecord({ path: recordPath, expectedBytes, record, lock: acquired.handle }),
    };
    const establishedAt = options.establishedAt ?? new Date().toISOString();
    const before = await io.read();
    const existingRole = before.kind === "valid"
      && before.record.recordId === identity.recordId
      && before.record.checkoutPath === checkoutPath
      && before.record.role.kind === "work-unit"
      && before.record.role.subject.kind === "work-unit"
      && before.record.role.subject.key === options.wuName
      && before.record.role.subject.claimId === null
      && before.record.role.parentCheckoutPath === null;
    if (before.kind !== "absent" && !existingRole) {
      throw new Error("cannot establish work-unit session locus: an incompatible role generation already exists");
    }

    let roleCreated = false;
    if (before.kind === "absent") {
      const minted = await mintDurableLocusRole({
        recordId: identity.recordId,
        checkoutPath,
        parentCheckoutPath: null,
        establishedAt,
        authority: { kind: "work-unit", key: options.wuName },
        io,
      });
      if (minted.kind === "refused") {
        throw new Error(`cannot establish work-unit session locus: ${minted.reason}`);
      }
      roleCreated = minted.kind === "applied";
    }

    if (!options.attachSession) {
      const current = await io.read();
      if (current.kind !== "valid") throw new Error("cannot establish work-unit session locus: minted record is unavailable");
      return { recordId: identity.recordId, leaseId: current.record.lease?.leaseId ?? null, roleCreated };
    }

    const current = await io.read();
    if (current.kind !== "valid") throw new Error("cannot attach work-unit session locus: record is unavailable");
    const sameAnchor = anchor.kind === "process"
      && current.record.lease?.anchor.kind === "process"
      && current.record.lease.anchor.pid === anchor.pid
      && current.record.lease.anchor.startToken === anchor.startToken
      && current.record.lease.anchor.inspector === anchor.inspector;
    const observedLiveness = current.record.lease === null
      ? null
      : current.record.lease.anchor.kind === "process"
        ? await verifyProcessAnchor(current.record.lease.anchor, inspector)
        : "unknown";
    if (anchor.kind === "unverifiable") {
      if (current.record.lease === null) {
        return { recordId: identity.recordId, leaseId: null, roleCreated };
      }
      if (observedLiveness !== "dead") {
        const reason = observedLiveness === "live" ? "lease-live" : "lease-unknown";
        throw new Error(`cannot attach work-unit session locus: ${reason}`);
      }
      const releasedLease = await releaseLocusLease({
        recordId: identity.recordId,
        leaseId: current.record.lease.leaseId,
        io,
      });
      if (releasedLease.kind === "refused") {
        throw new Error(`cannot attach work-unit session locus: ${releasedLease.reason}`);
      }
      return { recordId: identity.recordId, leaseId: null, roleCreated };
    }
    const attached = await attachLocusLease({
      recordId: identity.recordId,
      sessionHomePath: checkoutPath,
      anchor,
      ...(sameAnchor && current.record.lease !== null ? { leaseId: current.record.lease.leaseId } : {}),
      attachedAt: sameAnchor && current.record.lease !== null ? current.record.lease.attachedAt : establishedAt,
      heartbeatAt: establishedAt,
      observedLeaseId: current.record.lease?.leaseId ?? null,
      observedLiveness,
      io,
    });
    if (attached.kind === "refused") {
      if (roleCreated) {
        const created = await io.read();
        if (created.kind === "valid" && created.record.lease === null) {
          await removeLocusRecord({
            path: recordPath,
            expectedBytes: created.bytes,
            lock: acquired.handle,
          });
        }
      }
      throw new Error(`cannot attach work-unit session locus: ${attached.reason}`);
    }
    return {
      recordId: identity.recordId,
      leaseId: attached.record.lease?.leaseId ?? null,
      roleCreated,
    };
  };
  let result: WorkUnitLocusReceipt;
  try {
    result = await applyUnderLock();
  } catch (error) {
    await releaseLocusLock(acquired.handle);
    throw error;
  }
  const released = await releaseLocusLock(acquired.handle);
  if (released.kind !== "released") throw new Error(`cannot release work-unit session locus lock: ${released.kind}`);
  return result;
}

async function matchingRegisteredWorktrees(
  worktrees: readonly RegisteredWorktree[],
  canonicalCheckoutPath: string,
): Promise<RegisteredWorktree[]> {
  const candidates = await Promise.all(worktrees.map(async (worktree) => ({
    worktree,
    canonicalPath: await canonicalLocalPath(worktree.path),
  })));
  return candidates
    .filter((candidate) => candidate.canonicalPath === canonicalCheckoutPath)
    .map((candidate) => candidate.worktree);
}

async function selectMutationAnchor(
  requireSession: boolean,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  diagnostic: string,
): Promise<LocusAnchor> {
  const selected = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (selected.kind === "process" || requireSession) return selected;
  const command = await inspector.inspect(process.pid);
  if (command.kind !== "present") {
    const fallback = command.kind === "unverifiable"
      ? command.reason
      : "command process is absent";
    throw new Error(`${diagnostic}: ${selected.reason} (command fallback: ${fallback})`);
  }
  return {
    kind: "process" as const,
    pid: command.pid,
    startToken: command.startToken,
    inspector: inspector.kind,
    selector: "arc-command",
  };
}
