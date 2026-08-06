/** Work-unit checkout role minting at trusted lifecycle composition sites. */

import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { acquireLocusLock, releaseLocusLock } from "../locus/lock.js";
import { selectLocusMutationAnchor } from "../locus/mutation-anchor.js";
import { deriveLocusRecordId } from "../locus/path-identity.js";
import { createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { verifyProcessAnchor } from "../locus/process-inspector.js";
import { readLocusRecord, removeLocusRecord } from "../locus/record-store.js";
import { locusLockPath, locusRecordPath, resolveLocusRoot } from "../locus/root.js";
import type { LocusProcessAnchor } from "../locus/schema/index.js";

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
    ?? await selectLocusMutationAnchor(inspector, "cannot retire work-unit session locus");
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
      const sameAnchor = lease.anchor.kind === "process"
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
