/**
 * Pushability pre-check probe — detects client-side conditions that block or
 * inform a push attempt before it fires.
 *
 * Distinct concern from {@link ./worktree-sync.js | worktree-sync}: that probe
 * answers "what's local-vs-remote?", this one answers "can a push fire right
 * now?" Some conditions (rebase, detached HEAD) are global; others depend on
 * the push target (worktree branch upstream, notes-ref fetch refspec).
 *
 * Consumed by `commands/user/push-fetch.ts` before the notes push and by the
 * session-handoff probe envelope so the handoff workflow can gate the
 * worktree push.
 *
 * @module
 */

import { configureNotesRefspec, type GitExec } from "./exec.js";
import type { WorktreeSyncState } from "./worktree-sync.js";

/** Which push target(s) the matrix evaluates. `both` unions worktree and notes conditions. */
export type PushabilityTarget = "worktree" | "notes" | "both";

/** Discrete condition kinds the matrix can surface. */
export type PushabilityConditionKind =
  | "rebase-in-progress"
  | "detached-head"
  | "no-upstream-branch"
  | "missing-notes-refspec"
  | "force-push-required";

/**
 * Disposition the caller should treat the condition with.
 *
 * - `block`: push must not fire.
 * - `auto-fixed`: matrix detected and resolved inline (no caller action).
 * - `advisory`: matrix surfaces; caller decides refusal vs. allow.
 */
export type PushabilityDisposition = "block" | "auto-fixed" | "advisory";

/** A detected condition with disposition + guidance for the user. */
export interface PushabilityCondition {
  kind: PushabilityConditionKind;
  disposition: PushabilityDisposition;
  guidance: string;
  /** Set when `kind === "rebase-in-progress"`. */
  rebaseForm?: "rebase-merge" | "rebase-apply";
  /** Set when `kind === "no-upstream-branch"`. */
  branch?: string;
}

export interface PushabilityResult {
  /** True iff no `block`-disposition conditions are present. */
  allowed: boolean;
  conditions: PushabilityCondition[];
}

/** Path-existence check; defaults to `fs.access` in production wiring. */
export type AccessFn = (path: string) => Promise<void>;

export interface RunPushabilityStatusOptions {
  exec: GitExec;
  access: AccessFn;
  target: PushabilityTarget;
  /**
   * Pre-resolved worktree-sync state for force-push detection. When omitted,
   * force-push detection is skipped (caller can re-probe themselves).
   */
  worktreeSyncState?: WorktreeSyncState;
}

/** Notes refspec that must be present in `remote.origin.fetch` for round-tripping ARC user notes. */
const NOTES_REFSPEC = "+refs/notes/arc/user/*:refs/notes/arc/user/*";

/**
 * Probe pushability conditions for the requested target(s).
 *
 * Returns the union of detected conditions. Global conditions (rebase,
 * detached HEAD) apply regardless of target. Ref-specific conditions
 * (worktree upstream, notes refspec) apply only to their target.
 */
export async function runPushabilityStatus(
  options: RunPushabilityStatusOptions,
): Promise<PushabilityResult> {
  const { exec, access, target, worktreeSyncState } = options;
  const conditions: PushabilityCondition[] = [];

  const rebaseConditions = await detectRebaseInProgress(exec, access);
  conditions.push(...rebaseConditions);

  const evaluatesWorktree = target === "worktree" || target === "both";
  const evaluatesNotes = target === "notes" || target === "both";

  if (evaluatesWorktree) {
    const branchOrDetached = await detectBranchState(exec);
    if (branchOrDetached.kind === "detached-head") {
      conditions.push({
        kind: "detached-head",
        disposition: "block",
        guidance: "Push requires a branch — HEAD is detached. Check out a branch first.",
      });
    } else if (branchOrDetached.kind === "no-upstream") {
      conditions.push({
        kind: "no-upstream-branch",
        disposition: "block",
        branch: branchOrDetached.branch,
        guidance: `Set upstream first: \`git push -u origin ${branchOrDetached.branch}\``,
      });
    }
    if (worktreeSyncState === "diverged") {
      conditions.push({
        kind: "force-push-required",
        disposition: "advisory",
        guidance:
          "Worktree branch has diverged from origin — force-push would be required to publish. "
          + "Reconcile via rebase or merge before pushing.",
      });
    }
  }

  if (evaluatesNotes) {
    const refspecCondition = await detectNotesRefspec(exec);
    if (refspecCondition !== null) {
      conditions.push(refspecCondition);
    }
  }

  const allowed = !conditions.some((c) => c.disposition === "block");
  return { allowed, conditions };
}

/**
 * Detect rebase-in-progress markers under the resolved git directory.
 *
 * Both `rebase-merge` (interactive / standard rebase) and `rebase-apply`
 * (`git am`-style) are checked — either present means a rebase is active.
 * Returns one condition per detected form so callers can surface both if
 * the repository is in an unusual state with both directories present.
 */
async function detectRebaseInProgress(
  exec: GitExec,
  access: AccessFn,
): Promise<PushabilityCondition[]> {
  const found: PushabilityCondition[] = [];
  for (const form of ["rebase-merge", "rebase-apply"] as const) {
    const path = await resolveGitPath(exec, form);
    if (path === null) continue;
    try {
      await access(path);
      found.push({
        kind: "rebase-in-progress",
        disposition: "block",
        rebaseForm: form,
        guidance:
          form === "rebase-merge"
            ? "Rebase in progress — complete with `git rebase --continue` or abort with `git rebase --abort` before pushing."
            : "Rebase in progress (`git am` form) — complete with `git am --continue` or abort with `git am --abort` before pushing.",
      });
    } catch {
      // Marker absent — not in this rebase form.
    }
  }
  return found;
}

async function resolveGitPath(exec: GitExec, name: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--git-path", name]);
    const path = stdout.trim();
    return path === "" ? null : path;
  } catch {
    return null;
  }
}

interface BranchOk { kind: "branch"; branch: string }
interface BranchDetached { kind: "detached-head" }
interface BranchNoUpstream { kind: "no-upstream"; branch: string }

async function detectBranchState(
  exec: GitExec,
): Promise<BranchOk | BranchDetached | BranchNoUpstream> {
  let branch: string;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    branch = stdout.trim();
  } catch {
    return { kind: "detached-head" };
  }
  if (branch === "HEAD" || branch === "") {
    return { kind: "detached-head" };
  }

  try {
    await exec("git", ["rev-parse", "--abbrev-ref", "@{upstream}"]);
    return { kind: "branch", branch };
  } catch {
    return { kind: "no-upstream", branch };
  }
}

async function detectNotesRefspec(exec: GitExec): Promise<PushabilityCondition | null> {
  let fetchEntries = "";
  try {
    const { stdout } = await exec("git", ["config", "--get-all", "remote.origin.fetch"]);
    fetchEntries = stdout;
  } catch {
    // No fetch entries configured at all.
  }
  if (fetchEntries.includes(NOTES_REFSPEC)) {
    return null;
  }
  const installed = await configureNotesRefspec(exec);
  return {
    kind: "missing-notes-refspec",
    disposition: "auto-fixed",
    guidance: installed
      ? "Notes-ref fetch refspec was missing from `remote.origin.fetch` — auto-configured."
      : "Notes-ref fetch refspec missing and no `origin` remote configured — set up a remote before pushing notes.",
  };
}
