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
  | "force-push-required"
  | "worktree-not-aligned-with-origin";

/** Worktree-vs-origin alignment for the notes-target coherence check. */
export interface WorktreeAlignmentDetail {
  state: "local-ahead" | "behind" | "diverged";
  ahead: number;
  behind: number;
}

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
  /** Set when `kind === "worktree-not-aligned-with-origin"`. */
  worktreeAlignment?: WorktreeAlignmentDetail;
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
  /**
   * Worktree branch name for the notes-target alignment probe. When provided
   * with `target: "notes"`, the matrix runs a local-only
   * `git rev-list --left-right --count HEAD...origin/<branch>` to detect
   * notes-vs-worktree coherence violations (notes would otherwise reference
   * an unpushed or stale base commit). Suppressed on `target: "both"` since
   * paired-push commits to push the worktree first, resolving alignment.
   */
  worktreeBranch?: string;
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
  const { exec, access, target, worktreeSyncState, worktreeBranch } = options;
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

  // Notes-target-only: gate notes push on worktree-vs-origin alignment.
  // Paired-push (`target: "both"`) suppresses since the paired flow pushes
  // the worktree leg first, resolving alignment by virtue of the flow.
  if (target === "notes" && typeof worktreeBranch === "string" && worktreeBranch !== "") {
    const alignment = await probeWorktreeAlignment(exec, worktreeBranch);
    if (alignment !== null) {
      conditions.push({
        kind: "worktree-not-aligned-with-origin",
        disposition: "block",
        worktreeAlignment: alignment,
        guidance: buildAlignmentGuidance(alignment, worktreeBranch),
      });
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

/**
 * Probe HEAD vs. `origin/<branch>` via local-only `git rev-list`. Returns
 * the alignment detail when the worktree is not aligned, `null` when aligned
 * (counts both 0) or the probe failed (no-regression direction; matrix
 * defaults to no-gate when state is indeterminate).
 */
async function probeWorktreeAlignment(
  exec: GitExec,
  branch: string,
): Promise<WorktreeAlignmentDetail | null> {
  let stdout: string;
  try {
    const result = await exec("git", [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...origin/${branch}`,
    ]);
    stdout = result.stdout;
  } catch {
    return null;
  }
  const [aheadStr, behindStr] = stdout.trim().split(/\s+/u);
  const ahead = Number.parseInt(aheadStr ?? "", 10);
  const behind = Number.parseInt(behindStr ?? "", 10);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return null;
  if (ahead === 0 && behind === 0) return null;
  if (ahead > 0 && behind === 0) return { state: "local-ahead", ahead, behind };
  if (ahead === 0 && behind > 0) return { state: "behind", ahead, behind };
  return { state: "diverged", ahead, behind };
}

function buildAlignmentGuidance(
  alignment: WorktreeAlignmentDetail,
  branch: string,
): string {
  const { state, ahead, behind } = alignment;
  if (state === "local-ahead") {
    return `Worktree has ${ahead} unpushed commit(s) on \`${branch}\` — `
      + `push the worktree first (\`git push origin ${branch}\`), then retry the notes push.`;
  }
  if (state === "behind") {
    return `Worktree is ${behind} commit(s) behind \`origin/${branch}\` — `
      + "fast-forward or pull before pushing notes (notes would otherwise reference a stale base).";
  }
  return `Worktree has diverged from \`origin/${branch}\` (${ahead} ahead, ${behind} behind) — `
    + "reconcile via rebase or merge before pushing notes.";
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
