/** Target-agnostic linked-worktree creation with exact creation receipts. */

import { isAbsolute, resolve } from "node:path";

import type { GitExec } from "./exec.js";
import { resolveWorktreeLocation } from "./worktree-location.js";
import { resolvePrimaryWorktreePath } from "./worktree-roster.js";

export interface LinkedWorktreeCreationContext {
  exec: GitExec;
  pathExists(path: string): Promise<boolean>;
  /** Lifecycle-only stale registration repair; locus provisioning supplies none. */
  clearMissingRegistration?: (request: { targetPath: string; branch?: string }) => Promise<void>;
}

interface LinkedWorktreeCreationPlacement {
  locationTemplate: string;
  primaryWorktreePath?: string;
  repo: string;
  placementName: string;
  base: string;
}
export type LinkedWorktreeCreationOptions = LinkedWorktreeCreationPlacement & (
  | { detached: true; branch?: never; createBranch?: false }
  | { detached?: false; branch: string; createBranch: boolean }
);
interface LinkedWorktreeCreationProof {
  readonly worktreePath: string;
  readonly worktreeCreated: true;
  readonly base: string | null;
}
export type LinkedWorktreeCreationReceipt = LinkedWorktreeCreationProof & (
  | { readonly branch: string; readonly branchCreated: boolean; readonly detached?: false }
  | { readonly branch: null; readonly branchCreated: false; readonly detached: true }
);

export type LinkedWorktreeCreationResult =
  | { readonly kind: "created"; readonly receipt: LinkedWorktreeCreationReceipt }
  | { readonly kind: "refused"; readonly reason: "path-collision"; readonly worktreePath: string }
  | {
      readonly kind: "error";
      readonly reason: "primary-unavailable" | "git-worktree-add-failed" | "stale-registration-refused";
      readonly error: Error;
    };

/** Resolve configured placement and perform one provenance-free `git worktree add`. */
export async function createLinkedWorktree(
  context: LinkedWorktreeCreationContext,
  options: LinkedWorktreeCreationOptions,
): Promise<LinkedWorktreeCreationResult> {
  const templatedPath = resolveWorktreeLocation({
    template: options.locationTemplate,
    repo: options.repo,
    name: options.placementName,
    branch: options.branch ?? options.placementName,
  });
  let worktreePath = templatedPath;
  if (!isAbsolute(templatedPath)) {
    const primaryWorktreePath = options.primaryWorktreePath ?? await resolvePrimaryWorktreePath(context.exec);
    if (primaryWorktreePath === null) {
      return {
        kind: "error",
        reason: "primary-unavailable",
        error: new Error("Cannot resolve the primary worktree for relative linked-worktree placement"),
      };
    }
    worktreePath = resolve(primaryWorktreePath, templatedPath);
  }
  if (await context.pathExists(worktreePath)) {
    return { kind: "refused", reason: "path-collision", worktreePath };
  }
  try {
    await context.clearMissingRegistration?.({ targetPath: worktreePath, ...(options.branch === undefined ? {} : { branch: options.branch }) });
  } catch (error) {
    return { kind: "error", reason: "stale-registration-refused", error: error instanceof Error ? error : new Error(String(error)) };
  }
  const args = worktreeAddArguments(options, worktreePath);
  try {
    await context.exec("git", args);
  } catch (error) {
    return {
      kind: "error",
      reason: "git-worktree-add-failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
  const proof = { worktreePath, worktreeCreated: true as const, base: options.detached || options.createBranch ? options.base : null };
  const receipt: LinkedWorktreeCreationReceipt = options.detached
    ? { ...proof, branch: null, branchCreated: false, detached: true }
    : { ...proof, branch: options.branch, branchCreated: options.createBranch };
  return { kind: "created", receipt };
}

function worktreeAddArguments(options: LinkedWorktreeCreationOptions, path: string): string[] {
  if (options.detached) return ["worktree", "add", "--detach", path, options.base];
  return options.createBranch ? ["worktree", "add", path, "-b", options.branch, options.base] : ["worktree", "add", path, options.branch];
}
