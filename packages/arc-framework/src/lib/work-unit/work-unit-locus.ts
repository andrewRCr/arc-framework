/** Work-unit checkout role minting at trusted lifecycle composition sites. */

import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { acquireLocusLock, releaseLocusLock } from "../locus/lock.js";
import { attachLocusLease, mintDurableLocusRole } from "../locus/mutation.js";
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

export interface WorkUnitLocusDriver {
  reconcile(options: ReconcileWorkUnitLocusOptions): Promise<WorkUnitLocusReceipt>;
}

/** Bind WU role composition to the machine-local locus store. */
export function createNodeWorkUnitLocusDriver(options: {
  readonly exec: GitExec;
  readonly identity: string;
}): WorkUnitLocusDriver {
  return {
    reconcile: (request) => reconcileNodeWorkUnitLocus(options, request),
  };
}

async function reconcileNodeWorkUnitLocus(
  runtime: { readonly exec: GitExec; readonly identity: string },
  options: ReconcileWorkUnitLocusOptions,
): Promise<WorkUnitLocusReceipt> {
  const checkoutPath = resolve(options.checkoutPath);
  const topology = await scanRegisteredWorktrees(runtime.exec);
  if (!topology.ok) throw new Error(`cannot establish work-unit locus: ${topology.message}`);
  const matches = topology.worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath);
  const target = matches.length === 1 ? matches[0] : undefined;
  if (target === undefined || target.detached || target.branch !== options.branch) {
    throw new Error("cannot establish work-unit locus: target is not an exact live worktree roster entry");
  }

  const inspector = createPlatformProcessInspector();
  const selectedAnchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  let anchor;
  if (selectedAnchor.kind === "process") {
    anchor = selectedAnchor;
  } else {
    if (options.attachSession) {
      throw new Error(`cannot establish work-unit locus: ${selectedAnchor.reason}`);
    }
    const command = await inspector.inspect(process.pid);
    if (command.kind !== "present") {
      throw new Error(`cannot establish work-unit locus: ${selectedAnchor.reason}`);
    }
    anchor = {
      kind: "process" as const,
      pid: command.pid,
      startToken: command.startToken,
      inspector: inspector.kind,
      selector: "arc-command",
    };
  }
  const root = await resolveLocusRoot({ identity: runtime.identity, scan: () => Promise.resolve(topology) });
  if (!root.ok) throw new Error(`cannot establish work-unit locus: ${root.message}`);
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const identity = deriveLocusRecordId(checkoutPath, pathFlavor);
  const recordPath = locusRecordPath(root, identity.digest);
  const acquired = await acquireLocusLock({
    path: locusLockPath(root, identity.digest),
    anchor,
    inspector,
  });
  if (acquired.kind !== "acquired") {
    throw new Error(`cannot establish work-unit locus: record lock is ${acquired.reason}`);
  }

  const applyUnderLock = async (): Promise<WorkUnitLocusReceipt> => {
    const io = {
      read: () => readLocusRecord({
        path: recordPath,
        expectedDigest: identity.digest,
        pathFlavor,
      }),
      mint: (record: Parameters<typeof mintLocusRecord>[0]["record"]) =>
        mintLocusRecord({ path: recordPath, record }),
      replace: (expectedBytes: Buffer, record: Parameters<typeof replaceLocusRecord>[0]["record"]) =>
        replaceLocusRecord({ path: recordPath, expectedBytes, record }),
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
      throw new Error("cannot establish work-unit locus: an incompatible role generation already exists");
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
        throw new Error(`cannot establish work-unit locus: ${minted.reason}`);
      }
      roleCreated = minted.kind === "applied";
    }

    if (!options.attachSession) {
      const current = await io.read();
      if (current.kind !== "valid") throw new Error("cannot establish work-unit locus: minted record is unavailable");
      return { recordId: identity.recordId, leaseId: current.record.lease?.leaseId ?? null, roleCreated };
    }

    const current = await io.read();
    if (current.kind !== "valid") throw new Error("cannot attach work-unit locus: record is unavailable");
    const sameAnchor = current.record.lease?.anchor.kind === "process"
      && current.record.lease.anchor.pid === anchor.pid
      && current.record.lease.anchor.startToken === anchor.startToken
      && current.record.lease.anchor.inspector === anchor.inspector;
    const observedLiveness = current.record.lease === null
      ? null
      : current.record.lease.anchor.kind === "process"
        ? await verifyProcessAnchor(current.record.lease.anchor, inspector)
        : "unknown";
    const attached = await attachLocusLease({
      recordId: identity.recordId,
      sessionHomePath: checkoutPath,
      anchor,
      ...(sameAnchor && current.record.lease !== null ? { leaseId: current.record.lease.leaseId } : {}),
      attachedAt: sameAnchor && current.record.lease !== null ? current.record.lease.attachedAt : establishedAt,
      heartbeatAt: establishedAt,
      observedLiveness,
      io,
    });
    if (attached.kind === "refused") {
      if (roleCreated) {
        const created = await io.read();
        if (created.kind === "valid" && created.record.lease === null) {
          await removeLocusRecord({ path: recordPath, expectedBytes: created.bytes });
        }
      }
      throw new Error(`cannot attach work-unit locus: ${attached.reason}`);
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
  if (released.kind !== "released") throw new Error(`cannot release work-unit locus lock: ${released.kind}`);
  return result;
}
