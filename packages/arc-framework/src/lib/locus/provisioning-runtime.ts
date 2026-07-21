/** Production filesystem and Git boundaries for transient-locus provisioning. */

import { access, cp } from "node:fs/promises";

import {
  createLinkedWorktree,
  type LinkedWorktreeCreationReceipt,
} from "../git/linked-worktree.js";
import { setupLinkedWorktree } from "../git/linked-worktree-setup.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import {
  createWorktreeMarkerGeneration,
  ensureWorktreeMarkerIgnored,
  nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarkerGeneration,
  removeWorktreeMarkerGeneration,
  replaceWorktreeMarkerGeneration,
} from "../git/worktree-marker.js";
import { acquireLocusLock, releaseLocusLock, type LocusLockHandle } from "./lock.js";
import { deriveLocusRecordId, type PathFlavor } from "./path-identity.js";
import type { ProcessInspector } from "./process-inspector.js";
import { readPrimarySafety } from "./primary-safety.js";
import type {
  PrimaryCheckoutReceipt,
  ProvisionTransientLocusDependencies,
  ProvisioningRecordLock,
} from "./provisioning-types.js";
import {
  mintLocusRecord,
  readLocusRecord,
  removeLocusRecord,
  replaceLocusRecord,
} from "./record-store.js";
import { locusLockPath, locusRecordPath, resolveLocusRoot } from "./root.js";
import type { LocusProcessAnchor } from "./schema/index.js";

export interface NodeProvisioningRuntimeOptions {
  readonly exec: GitExec;
  readonly identity: string;
  readonly anchor: LocusProcessAnchor;
  readonly inspector: ProcessInspector;
  readonly pathFlavor: PathFlavor;
  readonly base: string;
  readonly branch: string | null;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
}

/** Bind low-level provisioning to exact-generation production I/O. */
export function createNodeProvisioningDependencies(
  options: NodeProvisioningRuntimeOptions,
): ProvisionTransientLocusDependencies {
  const heldLocks = new Map<string, HeldProvisioningLock>();
  return {
    createLinkedWorktree: (request) => createLinkedWorktree({
      exec: options.exec,
      pathExists: async (path) => access(path).then(() => true, () => false),
    }, request),
    scanWorktrees: () => scanRegisteredWorktrees(options.exec),
    readMarker: async (worktreePath) => {
      const result = await readWorktreeMarkerGeneration(worktreePath);
      if (result.kind === "present") return result;
      if (result.kind === "absent") return result;
      return { kind: "malformed", message: result.message };
    },
    createMarker: async (worktreePath, marker) => {
      await ensureWorktreeMarkerIgnored(worktreePath, options.exec, nodeWorktreeMarkerIgnoreFs);
      return createWorktreeMarkerGeneration(worktreePath, marker);
    },
    replaceMarker: replaceWorktreeMarkerGeneration,
    removeMarker: removeWorktreeMarkerGeneration,
    setupWorktree: async (worktreePath, primaryPath) => {
      await setupLinkedWorktree({
        exec: options.exec,
        fs: {
          directoryExists: async (path) => access(path).then(() => true, () => false),
          copyDirectory: (source, destination) => cp(source, destination, { recursive: true }),
        },
      }, {
        worktreePath,
        primaryWorktreePath: primaryPath,
        postCreateScript: options.postCreateScript,
        registeredHarnessDirs: options.registeredHarnessDirs,
      });
    },
    acquireRecordLock: async (checkoutPath) => {
      const location = await recordLocation(options, checkoutPath);
      if (location.kind === "error") throw new Error(location.message);
      const acquired = await acquireLocusLock({
        path: location.lockPath,
        anchor: options.anchor,
        inspector: options.inspector,
      });
      if (acquired.kind !== "acquired") return acquired;
      heldLocks.set(acquired.handle.token, {
        lock: acquired.handle,
        recordId: location.recordId,
        recordPath: location.recordPath,
      });
      return {
        kind: "acquired",
        handle: {
          recordId: location.recordId,
          recordPath: location.recordPath,
          token: acquired.handle.token,
        },
      };
    },
    releaseRecordLock: async (handle) => {
      const held = requireHeldLock(heldLocks, handle);
      const released = await releaseLocusLock(held.lock);
      if (released.kind !== "released") throw new Error(`Could not release locus lock: ${released.kind}`);
      heldLocks.delete(handle.token);
    },
    revalidateTarget: async ({ proposal, checkoutPath, handle }) => {
      requireHeldLock(heldLocks, handle);
      const topology = await scanRegisteredWorktrees(options.exec);
      if (!topology.ok) return { kind: "refused", reason: "topology-unknown" };
      const matches = topology.worktrees.filter((entry) => entry.path === checkoutPath);
      const target = matches[0];
      if (matches.length !== 1 || target === undefined || target.detached) {
        return { kind: "refused", reason: "topology-unknown" };
      }
      if (proposal.allocation.kind === "spawn") {
        return !target.primary && target.branch === options.branch
          ? { kind: "ready" }
          : { kind: "refused", reason: "topology-unknown" };
      }
      if (!target.primary) return { kind: "refused", reason: "topology-unknown" };
      const safety = await readPrimarySafety({
        primaryPath: checkoutPath,
        baseBranch: options.base,
        exec: options.exec,
      });
      if (safety.kind === "error") return { kind: "refused", reason: "topology-unknown" };
      if (!safety.clean) return { kind: "refused", reason: "primary-dirty" };
      if (!safety.onBase) return { kind: "refused", reason: "primary-off-base" };
      return { kind: "ready" };
    },
    checkoutPrimary: (checkoutPath, branch, expectedBranchHead) =>
      checkoutPrimary(options.exec, checkoutPath, branch, expectedBranchHead),
    rollbackPrimary: (checkoutPath, receipt) => rollbackPrimary(options.exec, checkoutPath, receipt),
    readRecord: (path, handle) => {
      requireHeldLock(heldLocks, handle);
      return readLocusRecord({
        path,
        expectedDigest: digestFromRecordId(handle.recordId),
        pathFlavor: options.pathFlavor,
      });
    },
    mintRecord: (path, record, handle) => {
      requireHeldLock(heldLocks, handle);
      return mintLocusRecord({ path, record });
    },
    replaceRecord: (path, expectedBytes, record, handle) => {
      requireHeldLock(heldLocks, handle);
      return replaceLocusRecord({ path, expectedBytes, record });
    },
    removeRecord: (path, expectedBytes, handle) => {
      requireHeldLock(heldLocks, handle);
      return removeLocusRecord({ path, expectedBytes });
    },
    rollbackSpawned: (receipt, rosterHead) => rollbackSpawned(options.exec, receipt, rosterHead),
  };
}

async function recordLocation(
  options: Pick<NodeProvisioningRuntimeOptions, "exec" | "identity" | "pathFlavor">,
  checkoutPath: string,
): Promise<
  { kind: "ready"; recordId: string; recordPath: string; lockPath: string }
  | { kind: "error"; message: string }
> {
  const root = await resolveLocusRoot({ identity: options.identity, exec: options.exec });
  if (!root.ok) return { kind: "error", message: root.message };
  let identity;
  try {
    identity = deriveLocusRecordId(checkoutPath, options.pathFlavor);
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  return {
    kind: "ready",
    recordId: identity.recordId,
    recordPath: locusRecordPath(root, identity.digest),
    lockPath: locusLockPath(root, identity.digest),
  };
}

function requireHeldLock(
  locks: ReadonlyMap<string, HeldProvisioningLock>,
  handle: ProvisioningRecordLock,
): HeldProvisioningLock {
  const held = locks.get(handle.token);
  if (held === undefined || held.recordId !== handle.recordId || held.recordPath !== handle.recordPath) {
    throw new Error("Provisioning record lock is not owned by this invocation");
  }
  return held;
}

interface HeldProvisioningLock {
  readonly lock: LocusLockHandle;
  readonly recordId: string;
  readonly recordPath: string;
}

async function checkoutPrimary(
  exec: GitExec,
  checkoutPath: string,
  branch: string | null,
  expectedBranchHead: string | null,
): Promise<PrimaryCheckoutReceipt> {
  const previousBranch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath }))
    .stdout.trim();
  const previousHead = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  if (previousBranch === "" || previousHead === "") throw new Error("Primary checkout state is unavailable");
  if (branch === null) {
    return { kind: "idempotent", branchCreated: false, previousBranch, head: previousHead };
  }
  if (expectedBranchHead !== null) {
    await exec("git", ["checkout", branch], { cwd: checkoutPath });
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    if (head !== expectedBranchHead) {
      await exec("git", ["checkout", previousBranch], { cwd: checkoutPath });
      throw new Error("Retained Errand branch does not match the expected resume head");
    }
    return { kind: "applied", branchCreated: false, previousBranch, head };
  }
  await exec("git", ["checkout", "-b", branch, previousBranch], { cwd: checkoutPath });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  return { kind: "applied", branchCreated: true, previousBranch, head };
}

async function rollbackPrimary(
  exec: GitExec,
  checkoutPath: string,
  receipt: PrimaryCheckoutReceipt,
): Promise<{ kind: "rolled-back" } | { kind: "generation-mismatch" }> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  if (head !== receipt.head) return { kind: "generation-mismatch" };
  if (!receipt.branchCreated) {
    if (receipt.kind === "idempotent") {
      return branch === receipt.previousBranch ? { kind: "rolled-back" } : { kind: "generation-mismatch" };
    }
    if (branch === receipt.previousBranch || branch === "") return { kind: "generation-mismatch" };
    await exec("git", ["checkout", receipt.previousBranch], { cwd: checkoutPath });
    return { kind: "rolled-back" };
  }
  if (branch === "" || branch === receipt.previousBranch) return { kind: "generation-mismatch" };
  await exec("git", ["checkout", receipt.previousBranch], { cwd: checkoutPath });
  await exec("git", ["branch", "-D", branch], { cwd: checkoutPath });
  return { kind: "rolled-back" };
}

async function rollbackSpawned(
  exec: GitExec,
  receipt: LinkedWorktreeCreationReceipt,
  rosterHead: string,
): Promise<{ kind: "rolled-back" } | { kind: "generation-mismatch" }> {
  const topology = await scanRegisteredWorktrees(exec);
  if (!topology.ok) return { kind: "generation-mismatch" };
  const matches = topology.worktrees.filter((entry) => entry.path === receipt.worktreePath);
  const target = matches[0];
  if (matches.length !== 1 || target === undefined || target.head !== rosterHead
    || target.branch !== receipt.branch || target.detached) return { kind: "generation-mismatch" };
  await exec("git", ["worktree", "remove", receipt.worktreePath]);
  if (receipt.branchCreated) await exec("git", ["branch", "-D", receipt.branch]);
  return { kind: "rolled-back" };
}

function digestFromRecordId(recordId: string): string {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(recordId);
  if (match?.[1] === undefined) throw new Error("Invalid locus record ID");
  return match[1];
}
