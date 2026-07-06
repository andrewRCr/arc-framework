/**
 * Worktree cleanup gating.
 *
 * Two pieces, consumed where ARC decides whether to remove a worktree (the
 * branch-gone cascade and the stale-worktree sweep):
 *
 * - {@link isWorktreeClean} — whether a worktree's tree has no uncommitted
 *   changes, via `git status --porcelain` scoped to its `cwd`.
 * - {@link decideWorktreeCleanup} — the pure decision mapping marker presence,
 *   clean, identity-global user-surface safety, merged, and removal-context
 *   signals to one removability state. The returned state describes the
 *   *worktree* (not the action) — each caller chooses its action per its own
 *   approval model: the branch-gone cascade's user-offer, the stale-worktree
 *   sweep's user-offer.
 *
 * The `merged` signal `decideWorktreeCleanup` consumes is resolved by the callers
 * from the shared branch-containment oracle (`isLandedInBase`), which proves
 * patch-equivalence via `git cherry` and so detects squash- and rebase-merges,
 * not just fast-forward / merge-commit ancestry.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type { WorktreeMarkerReadResult } from "./worktree-marker.js";

/** Inputs for the worktree-clean check. */
export interface IsWorktreeCleanOptions {
  exec: GitExec;
  /** Working-tree root to scope the status check to (each linked worktree has its own tree). */
  cwd: string;
}

/**
 * Whether a specific worktree's tree is clean (no uncommitted changes), via
 * `git status --porcelain` scoped to its `cwd`. An exec failure reads as
 * not-clean — the safe default, so uncertainty never yields a removal offer
 * downstream.
 *
 * @param options - Executor and the worktree root to check
 * @returns Whether the worktree's tree is clean
 */
export async function isWorktreeClean(options: IsWorktreeCleanOptions): Promise<boolean> {
  try {
    const { stdout } = await options.exec("git", ["status", "--porcelain"], { cwd: options.cwd });
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

/** Removability state of an ARC-managed worktree at a cleanup site. */
export type WorktreeCleanupDecision =
  | { action: "removable" }
  | { action: "blocked"; reason: "uncommitted" | "user-surfaces" | "unmerged" }
  | { action: "external" };

/**
 * Removal context — what kind of cleanup the call site is performing.
 *
 * - `shipped` — default cleanup model; the worktree is being cleaned up
 *   because its WU shipped. The merge gate applies: unmerged work blocks
 *   removal.
 * - `abandonment` — explicit user abandonment (e.g. deactivate Case A-delete)
 *   authorizes removal of unmerged work, so the merge gate is bypassed.
 */
export type WorktreeCleanupContext = "shipped" | "abandonment";

/** Signals the cleanup decision is computed from. */
export interface WorktreeCleanupInputs {
  /** Result of reading the worktree-ownership marker. */
  marker: WorktreeMarkerReadResult;
  /** Whether the working tree is clean (no uncommitted changes). */
  clean: boolean;
  /** Whether ignored identity-global user surfaces are absent or safely mergeable. */
  userSurfacesSafe?: boolean;
  /** Whether the branch is merged into the integration target. */
  merged: boolean;
  /** Removal context — gates whether the merge check applies. */
  context: WorktreeCleanupContext;
}

/**
 * Map marker / clean / merged / context signals to a removability state.
 *
 * - No trustworthy marker (`absent` or `malformed`) → `external`: the worktree
 *   is externally managed; cleanup is the operator's tool's concern.
 * - Present but uncommitted changes → `blocked` (`uncommitted`): never
 *   auto-remove; the dirty state is shown.
 * - Present and clean but unreconcilable ignored identity-global user surfaces
 *   → `blocked` (`user-surfaces`): a removal would drop local-only user content.
 * - Present and clean but unmerged under `shipped` context → `blocked`
 *   (`unmerged`): the branch (or its unpushed commits) is not in the target;
 *   never auto-remove.
 * - Present + clean + (merged OR `abandonment` context) → `removable`: the
 *   worktree is safe to remove. Abandonment authorizes removal of unmerged
 *   work, so the merge gate is bypassed.
 *
 * @param inputs - Marker result + clean + merged + context signals
 * @returns The worktree's removability state
 */
export function decideWorktreeCleanup(inputs: WorktreeCleanupInputs): WorktreeCleanupDecision {
  const { marker, clean, merged, context } = inputs;
  if (marker.kind !== "present") {
    return { action: "external" };
  }
  if (!clean) {
    return { action: "blocked", reason: "uncommitted" };
  }
  if (inputs.userSurfacesSafe === false) {
    return { action: "blocked", reason: "user-surfaces" };
  }
  if (!merged && context === "shipped") {
    return { action: "blocked", reason: "unmerged" };
  }
  return { action: "removable" };
}
