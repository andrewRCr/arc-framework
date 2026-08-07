/** Git-owned cleanup for one deterministic decomposition candidate projection. */

import { lstat } from "node:fs/promises";
import { normalize } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  readWorktreeMarker,
  type WorktreeMarkerReadResult,
} from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import { decomposeCandidateBranch } from "./decompose-candidate.js";

export interface GitOwnedDecomposeCandidateCleanupDependencies {
  cwd: string;
  exec: GitExec;
  scanWorktrees?: () => Promise<RegisteredWorktreeScanResult>;
  readMarker?: (path: string) => Promise<WorktreeMarkerReadResult>;
  pathExists?: (path: string) => Promise<boolean>;
  removeWorktree?: (path: string) => Promise<void>;
}

export type GitOwnedDecomposeCandidateCleanupResult =
  | {
      status: "cleaned";
      branch: string;
      branchOutcome: "deleted" | "already-absent";
      worktreeOutcome: "removed" | "already-absent";
    }
  | {
      status: "refused";
      reason:
        | "candidate-ambiguous"
        | "candidate-head-moved"
        | "candidate-marker-mismatch"
        | "candidate-path-unregistered"
        | "candidate-topology-unavailable"
        | "candidate-user-content"
        | "candidate-cleanup-raced";
    };

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveBranchHead(
  deps: GitOwnedDecomposeCandidateCleanupDependencies,
  branch: string,
): Promise<string | null> {
  const { stdout } = await deps.exec(
    "git",
    ["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`],
    { cwd: deps.cwd },
  );
  const heads = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return heads.length === 0 ? null : heads.length === 1 ? heads[0] ?? null : null;
}

function markerMatches(marker: WorktreeMarkerReadResult, branch: string): boolean {
  return marker.kind === "present"
    && marker.marker.spawnedByArc
    && marker.marker.createdFor?.kind === "branch"
    && marker.marker.createdFor.ref === branch;
}

function hasUserContent(status: string): boolean {
  return status.split("\n").filter(Boolean).some((line) =>
    line.length < 3 || line.startsWith("??") || line[1] !== " ");
}

/** Remove only an authenticated candidate worktree and compare-delete its pinned branch. */
export async function cleanupGitOwnedDecomposeCandidate(
  input: { origin: string; expectedHead: string; expectedPath?: string },
  deps: GitOwnedDecomposeCandidateCleanupDependencies,
): Promise<GitOwnedDecomposeCandidateCleanupResult> {
  const branch = decomposeCandidateBranch(input.origin);
  const scan = await (deps.scanWorktrees ?? (() => scanRegisteredWorktrees(
    async (command, args, options) => await deps.exec(command, args, {
      ...options,
      cwd: options?.cwd ?? deps.cwd,
    }),
  )))();
  if (!scan.ok) return { status: "refused", reason: "candidate-topology-unavailable" };
  const expectedPath = input.expectedPath === undefined ? undefined : normalize(input.expectedPath);
  const matches = scan.worktrees.filter(({ branch: registeredBranch, path }) =>
    registeredBranch === branch || (expectedPath !== undefined && normalize(path) === expectedPath));
  if (matches.length > 1) return { status: "refused", reason: "candidate-ambiguous" };

  const branchHead = await resolveBranchHead(deps, branch);
  if (branchHead !== null && branchHead !== input.expectedHead) {
    return { status: "refused", reason: "candidate-head-moved" };
  }
  const registration = matches[0];
  if (registration === undefined) {
    if (expectedPath !== undefined
      && await (deps.pathExists ?? defaultPathExists)(expectedPath)) {
      return { status: "refused", reason: "candidate-path-unregistered" };
    }
    if (branchHead === null) {
      return {
        status: "cleaned",
        branch,
        branchOutcome: "already-absent",
        worktreeOutcome: "already-absent",
      };
    }
    await deps.exec("git", ["update-ref", "-d", `refs/heads/${branch}`, branchHead], { cwd: deps.cwd });
    return await resolveBranchHead(deps, branch) === null
      ? { status: "cleaned", branch, branchOutcome: "deleted", worktreeOutcome: "already-absent" }
      : { status: "refused", reason: "candidate-cleanup-raced" };
  }
  const path = normalize(registration.path);
  if (registration.branch !== branch
    || registration.head !== input.expectedHead
    || (expectedPath !== undefined && path !== expectedPath)) {
    return { status: "refused", reason: "candidate-ambiguous" };
  }
  const marker = await (deps.readMarker ?? readWorktreeMarker)(path);
  if (!markerMatches(marker, branch)) {
    return { status: "refused", reason: "candidate-marker-mismatch" };
  }
  const { stdout: status } = await deps.exec(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: path },
  );
  if (hasUserContent(status)) return { status: "refused", reason: "candidate-user-content" };
  if (status !== "") {
    await deps.exec("git", ["reset", "--hard", input.expectedHead], { cwd: path });
  }
  const [headAfterReset, markerAfterReset] = await Promise.all([
    resolveBranchHead(deps, branch),
    (deps.readMarker ?? readWorktreeMarker)(path),
  ]);
  if (headAfterReset !== input.expectedHead || !markerMatches(markerAfterReset, branch)) {
    return { status: "refused", reason: "candidate-cleanup-raced" };
  }

  if (deps.removeWorktree === undefined) {
    await deps.exec("git", ["worktree", "remove", path], { cwd: deps.cwd });
  } else {
    await deps.removeWorktree(path);
  }
  const current = await resolveBranchHead(deps, branch);
  if (current !== input.expectedHead) {
    return current === null
      ? { status: "cleaned", branch, branchOutcome: "already-absent", worktreeOutcome: "removed" }
      : { status: "refused", reason: "candidate-cleanup-raced" };
  }
  await deps.exec("git", ["update-ref", "-d", `refs/heads/${branch}`, current], { cwd: deps.cwd });
  return await resolveBranchHead(deps, branch) === null
    ? { status: "cleaned", branch, branchOutcome: "deleted", worktreeOutcome: "removed" }
    : { status: "refused", reason: "candidate-cleanup-raced" };
}
