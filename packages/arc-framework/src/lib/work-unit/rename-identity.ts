/**
 * Idempotent branch-identity legs used by work-unit rename orchestration.
 *
 * The local leg guards the shipped branch mutator with live ref-state checks.
 * The remote leg preserves deliberately unpublished branches and leases removal
 * of a previously observed old head.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  deleteRemoteBranch,
  reconcileBranch,
  type ReconcileBranchContext,
} from "./mutators/reconcile-branch.js";

/** Result of converging the local branch name. */
export type RenameLocalBranchResult =
  | { status: "renamed" }
  | { status: "already-renamed" };

/** Parameters for the local branch rename leg. */
export interface RenameLocalBranchParams {
  oldBranch: string;
  newBranch: string;
}

/**
 * Rename a present old local branch, or accept the already-renamed post-state.
 *
 * @param ctx - Git seam passed to the shipped branch mutator
 * @param params - Old and new full branch names
 * @returns Whether this invocation renamed the branch or found it complete
 */
export async function reconcileRenameLocalBranch(
  ctx: ReconcileBranchContext,
  params: RenameLocalBranchParams,
): Promise<RenameLocalBranchResult> {
  const { stdout } = await ctx.exec("git", [
    "for-each-ref",
    "--format=%(refname)",
    `refs/heads/${params.oldBranch}`,
    `refs/heads/${params.newBranch}`,
  ]);
  const refs = new Set(stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
  const oldPresent = refs.has(`refs/heads/${params.oldBranch}`);
  const newPresent = refs.has(`refs/heads/${params.newBranch}`);

  if (oldPresent && newPresent) {
    throw new Error(`cannot rename local branch while both refs exist: ${params.oldBranch}, ${params.newBranch}`);
  }
  if (newPresent) return { status: "already-renamed" };
  if (!oldPresent) {
    throw new Error(`cannot rename local branch; neither ref exists: ${params.oldBranch}, ${params.newBranch}`);
  }

  await reconcileBranch(ctx, {
    mutation: "rename",
    branch: params.oldBranch,
    toBranch: params.newBranch,
  });
  return { status: "renamed" };
}

/**
 * Read an exact live remote branch head without updating tracking refs.
 *
 * @param exec - Git executor
 * @param remote - Remote name
 * @param branch - Full branch name below `refs/heads/`
 * @returns The live object ID, or `null` when the head is absent
 */
export async function readRemoteBranchOid(
  exec: GitExec,
  remote: string,
  branch: string,
): Promise<string | null> {
  const ref = `refs/heads/${branch}`;
  const { stdout } = await exec("git", ["ls-remote", "--heads", remote, ref]);
  const matches = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts.length >= 2 && parts[1] === ref);
  if (matches.length === 0) return null;
  if (matches.length !== 1 || !matches[0]?.[0]) {
    throw new Error(`remote ${remote} returned an ambiguous head for ${branch}`);
  }
  return matches[0][0];
}

/** Result of converging the remote branch identity. */
export type RenameRemoteBranchResult =
  | { status: "unpublished" }
  | { status: "renamed"; oldOid: string }
  | { status: "stale"; expectedOid: string; actualOid: string | null };

/** Parameters captured across preflight and the remote rename leg. */
export interface RenameRemoteBranchParams extends RenameLocalBranchParams {
  remote: string;
  /** Old remote head captured before the local branch rename, or null when unpublished. */
  oldRemoteOid: string | null;
}

/**
 * Publish the new name only for a previously published branch, then lease-delete
 * the old head against its preflight object ID.
 *
 * @param ctx - Git seam
 * @param params - Remote, branch names, and preflight old-head proof
 * @returns The converged, unpublished, or stale-lease outcome
 */
export async function reconcileRenameRemoteBranch(
  ctx: { exec: GitExec },
  params: RenameRemoteBranchParams,
): Promise<RenameRemoteBranchResult> {
  if (params.oldRemoteOid === null) return { status: "unpublished" };

  await ctx.exec("git", ["push", "-u", params.remote, params.newBranch]);
  const outcome = await deleteRemoteBranch(
    ctx.exec,
    params.remote,
    params.oldBranch,
    params.oldRemoteOid,
  );
  if (outcome !== "stale") return { status: "renamed", oldOid: params.oldRemoteOid };

  return {
    status: "stale",
    expectedOid: params.oldRemoteOid,
    actualOid: await readRemoteBranchOid(ctx.exec, params.remote, params.oldBranch),
  };
}

/** Parameters for the branch that carries a backlog-stub rename. */
export interface RenameStubBranchParams {
  baseBranch: string;
  oldSlug: string;
  newSlug: string;
}

/** Result of running a stub rename on its short-lived branch. */
export interface RenameStubBranchResult<T> {
  branch: string;
  created: boolean;
  pendingIntegration: true;
  value: T;
}

/**
 * Run a backlog-stub rename on its deterministic short-lived branch and return
 * the primary checkout to base even when the operation refuses. Existing
 * branches are attached for resumability rather than re-cut.
 *
 * @param ctx - Git seam
 * @param params - Base and rename identities
 * @param operation - Rename operation to execute while the short-lived branch is checked out
 * @returns Operation value plus pending-integration branch state
 */
export async function withRenameStubBranch<T>(
  ctx: { exec: GitExec },
  params: RenameStubBranchParams,
  operation: (branch: string) => Promise<T>,
): Promise<RenameStubBranchResult<T>> {
  const branch = `chore/rename-${params.oldSlug}-to-${params.newSlug}`;
  const ref = `refs/heads/${branch}`;
  const { stdout } = await ctx.exec("git", ["for-each-ref", "--format=%(refname)", ref]);
  const exists = stdout.split(/\r?\n/u).some((line) => line.trim() === ref);
  await ctx.exec("git", exists
    ? ["switch", branch]
    : ["switch", "-c", branch, params.baseBranch]);
  try {
    return {
      branch,
      created: !exists,
      pendingIntegration: true,
      value: await operation(branch),
    };
  } finally {
    await ctx.exec("git", ["switch", params.baseBranch]);
  }
}
