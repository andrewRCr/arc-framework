/** Target-agnostic linked-worktree creation with exact creation receipts. */

import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "./exec.js";
import { resolveWorktreeLocation } from "./worktree-location.js";

export interface LinkedWorktreeCreationContext {
  exec: GitExec;
  pathExists(path: string): Promise<boolean>;
}

export interface LinkedWorktreeCreationOptions {
  locationTemplate: string;
  primaryWorktreePath: string;
  repo: string;
  placementName: string;
  branch: string;
  createBranch: boolean;
  base: string;
}

export interface LinkedWorktreeCreationReceipt {
  readonly worktreePath: string;
  readonly branch: string;
  readonly worktreeCreated: true;
  readonly branchCreated: boolean;
  readonly base: string | null;
}

export type LinkedWorktreeCreationResult =
  | { readonly kind: "created"; readonly receipt: LinkedWorktreeCreationReceipt }
  | { readonly kind: "refused"; readonly reason: "path-collision"; readonly worktreePath: string }
  | { readonly kind: "error"; readonly reason: "git-worktree-add-failed"; readonly error: Error };

/** Resolve configured placement and perform one provenance-free `git worktree add`. */
export async function createLinkedWorktree(
  context: LinkedWorktreeCreationContext,
  options: LinkedWorktreeCreationOptions,
): Promise<LinkedWorktreeCreationResult> {
  const templatedPath = resolveWorktreeLocation({
    template: options.locationTemplate,
    repo: options.repo,
    name: options.placementName,
    branch: options.branch,
  });
  const worktreePath = isAbsolute(templatedPath)
    ? templatedPath
    : resolve(options.primaryWorktreePath, templatedPath);
  if (await context.pathExists(worktreePath)) {
    return { kind: "refused", reason: "path-collision", worktreePath };
  }
  const args = options.createBranch
    ? ["worktree", "add", worktreePath, "-b", options.branch, options.base]
    : ["worktree", "add", worktreePath, options.branch];
  try {
    await context.exec("git", args);
  } catch (error) {
    return {
      kind: "error",
      reason: "git-worktree-add-failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
  return {
    kind: "created",
    receipt: {
      worktreePath,
      branch: options.branch,
      worktreeCreated: true,
      branchCreated: options.createBranch,
      base: options.createBranch ? options.base : null,
    },
  };
}
