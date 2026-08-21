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
import { readPrimarySafety } from "./primary-safety.js";
import {
  PrimaryCheckoutResidueError,
  type PrimaryCheckoutReceipt,
  type ProvisionTransientLocusDependencies,
} from "./provisioning-types.js";
import { withWorktreeOperationLock } from "../work-unit/worktree-operation-lock.js";

export interface NodeProvisioningRuntimeOptions {
  readonly exec: GitExec;
  readonly base: string;
  readonly branch: string | null;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
}

/** Bind low-level provisioning to exact-generation production I/O. */
export function createNodeProvisioningDependencies(
  options: NodeProvisioningRuntimeOptions,
): ProvisionTransientLocusDependencies {
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
    withOperationLock: (cwd, operation) => withWorktreeOperationLock({
      exec: options.exec,
      cwd,
      operation: async () => operation(),
    }),
    revalidateTarget: async ({ proposal, checkoutPath }) => {
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
    rollbackSpawned: (receipt, rosterHead, primaryWorktreePath) =>
      rollbackSpawned(options.exec, receipt, rosterHead, primaryWorktreePath),
  };
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
    if (expectedBranchHead !== null && previousHead !== expectedBranchHead) {
      throw new Error("Primary checkout does not match the expected pinned base head");
    }
    return {
      kind: "idempotent", branchCreated: false, branch: previousBranch, previousBranch, head: previousHead,
    };
  }
  // Everything past the mutating checkout runs under compensation: the head it reads is what the
  // caller's rollback proves against, so a failure before that read leaves nothing to roll back with.
  if (expectedBranchHead !== null) {
    await exec("git", ["checkout", branch], { cwd: checkoutPath });
    return await compensateOnFailure(exec, checkoutPath, { previousBranch, createdBranch: null }, async () => {
      const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
      if (head !== expectedBranchHead) {
        throw new Error("Retained Errand branch does not match the expected resume head");
      }
      return { kind: "applied", branchCreated: false, branch, previousBranch, head };
    });
  }
  await exec("git", ["checkout", "-b", branch, previousBranch], { cwd: checkoutPath });
  return await compensateOnFailure(exec, checkoutPath, { previousBranch, createdBranch: branch }, async () => {
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    if (head === "") throw new Error("Primary checkout head is unavailable after branch creation");
    return { kind: "applied", branchCreated: true, branch, previousBranch, head };
  });
}

/**
 * Run one post-mutation step, undoing the mutation when it fails.
 *
 * A successful undo restores the pre-mutation checkout and rethrows the original failure, so the
 * caller's evidence stays identity-only. An undo that fails raises
 * {@link PrimaryCheckoutResidueError}, since the checkout is then left mutated.
 */
async function compensateOnFailure(
  exec: GitExec,
  checkoutPath: string,
  undo: { previousBranch: string; createdBranch: string | null },
  run: () => Promise<PrimaryCheckoutReceipt>,
): Promise<PrimaryCheckoutReceipt> {
  try {
    return await run();
  } catch (error) {
    try {
      await exec("git", ["checkout", undo.previousBranch], { cwd: checkoutPath });
      if (undo.createdBranch !== null) {
        await exec("git", ["branch", "-D", undo.createdBranch], { cwd: checkoutPath });
      }
    } catch (undoError) {
      throw new PrimaryCheckoutResidueError(checkoutPath, undoError);
    }
    throw error;
  }
}

async function rollbackPrimary(
  exec: GitExec,
  checkoutPath: string,
  receipt: PrimaryCheckoutReceipt,
): Promise<{ kind: "rolled-back" } | { kind: "generation-mismatch" }> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  // Head alone cannot identify the branch this receipt created: any sibling branch at the same commit
  // satisfies it, so the branch name is proven too before anything is restored or deleted.
  if (head !== receipt.head || branch === "" || branch !== receipt.branch) {
    return { kind: "generation-mismatch" };
  }
  if (receipt.kind === "idempotent") return { kind: "rolled-back" };
  await exec("git", ["checkout", receipt.previousBranch], { cwd: checkoutPath });
  if (receipt.branchCreated) await exec("git", ["branch", "-D", receipt.branch], { cwd: checkoutPath });
  return { kind: "rolled-back" };
}

async function rollbackSpawned(
  exec: GitExec,
  receipt: LinkedWorktreeCreationReceipt,
  rosterHead: string,
  primaryWorktreePath: string,
): Promise<{ kind: "rolled-back" } | { kind: "generation-mismatch" }> {
  const pinnedExec: GitExec = (command, args, options) =>
    exec(command, args, { ...options, cwd: primaryWorktreePath });
  const topology = await scanRegisteredWorktrees(pinnedExec);
  if (!topology.ok) return { kind: "generation-mismatch" };
  const matches = topology.worktrees.filter((entry) => entry.path === receipt.worktreePath);
  const target = matches[0];
  if (matches.length !== 1 || target === undefined || target.head !== rosterHead
    || target.branch !== receipt.branch || target.detached) return { kind: "generation-mismatch" };
  await pinnedExec("git", ["worktree", "remove", receipt.worktreePath]);
  if (receipt.branchCreated) await pinnedExec("git", ["branch", "-D", receipt.branch]);
  return { kind: "rolled-back" };
}
