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
 * **Advisory disposition contract (caller refusal).** Conditions surfaced
 * with `disposition: "advisory"` (currently `force-push-required`) are not
 * automatic blocks — callers decide refusal vs. allow. Within the user-sync
 * surface, no automatic push opts into force-push; `arc user push --force`
 * is the explicit escape hatch. The contract is inherited by push wrappers
 * so a wrapper swapping the underlying push call preserves the refusal
 * posture without re-implementing it.
 *
 * **Single-leg / paired refusal asymmetry.** The paired flow refuses
 * `force-push-required` at the orchestrator boundary inside `runPairedPush`,
 * before save fires. Single-leg `runUserPush` (notes-only push) does not
 * refuse the advisory at its call site — divergent pushes instead route
 * through `handlers/push-recovery.ts`'s `[rejected]` branch, which surfaces
 * the conflict and offers force-push only on explicit user selection. Both
 * paths achieve user-facing safety; the asymmetry is intentional and
 * matches the worktree-vs-notes coupling difference (paired-push commits
 * the worktree first, so divergence at that boundary is recoverable; the
 * single-leg notes path runs against arbitrary remote state, so the
 * recovery branch is the natural touch point).
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
 * - `block`: push must not fire. Caller refuses without exception.
 * - `auto-fixed`: matrix detected and resolved inline (no caller action).
 * - `advisory`: matrix surfaces; caller decides refusal vs. allow.
 * - `caller-resolvable`: refuses by default, but the caller may resolve the
 *   underlying condition by adjusting the push invocation (e.g., injecting
 *   `-u` for `no-upstream-branch`). Orchestrators that know how to resolve
 *   the specific condition kind opt in; generic consumers treat it the same
 *   as `block`. See {@link isRefusalCondition}.
 */
export type PushabilityDisposition = "block" | "auto-fixed" | "advisory" | "caller-resolvable";

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
  /**
   * True iff no refusal-causing conditions are present, per
   * {@link isRefusalCondition} (covers `block` and `caller-resolvable`).
   * Orchestrators that resolve specific `caller-resolvable` kinds inspect
   * conditions directly and may proceed despite `allowed === false`.
   */
  allowed: boolean;
  conditions: PushabilityCondition[];
}

/**
 * Default refusal predicate: a condition causes refusal if its disposition is
 * `block` or `caller-resolvable`. The latter refuses by default; orchestrators
 * that know how to resolve a specific kind handle it explicitly rather than
 * via this predicate. `advisory` and `auto-fixed` dispositions are not
 * refusal-causing by default.
 */
export function isRefusalCondition(condition: PushabilityCondition): boolean {
  return condition.disposition === "block" || condition.disposition === "caller-resolvable";
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
   * Worktree branch name for the alignment probe. When provided with
   * `target: "notes"` or `target: "worktree"`, the matrix runs a local-only
   * `git rev-list --left-right --count HEAD...origin/<branch>` to detect
   * coherence violations:
   *
   * - `target: "notes"` — notes would otherwise reference an unpushed or
   *   stale base commit.
   * - `target: "worktree"` — single-leg worktree push call sites can refuse
   *   when local is behind or diverged from origin without re-deriving
   *   alignment from the worktree-sync state machine. Local-ahead is allowed:
   *   publishing local-ahead commits is the purpose of a worktree push.
   *
   * Suppressed on `target: "both"` — paired-push commits to push the
   * worktree leg first, resolving alignment by virtue of the flow.
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
        disposition: "caller-resolvable",
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

  // Single-target alignment probe: gate the push on worktree-vs-origin
  // alignment when the caller is pushing only one leg. Paired-push
  // (`target: "both"`) suppresses since the paired flow pushes the worktree
  // leg first, resolving alignment by virtue of the flow.
  if (target !== "both" && typeof worktreeBranch === "string" && worktreeBranch !== "") {
    const alignment = await probeWorktreeAlignment(exec, worktreeBranch);
    if (alignment !== null && shouldSurfaceAlignmentCondition(target, alignment)) {
      conditions.push({
        kind: "worktree-not-aligned-with-origin",
        disposition: "block",
        worktreeAlignment: alignment,
        guidance: buildAlignmentGuidance(alignment, worktreeBranch),
      });
    }
  }

  const allowed = !conditions.some(isRefusalCondition);
  return { allowed, conditions };
}

function shouldSurfaceAlignmentCondition(
  target: PushabilityTarget,
  alignment: WorktreeAlignmentDetail,
): boolean {
  if (target === "worktree" && alignment.state === "local-ahead") {
    return false;
  }
  return true;
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
