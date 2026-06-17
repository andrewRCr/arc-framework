/**
 * Write-context classification — the machine-checked guard behind any command
 * that writes shared base-branch paths (the `arc-housekeep` drain today;
 * `run-errand` Launch reuses the same primitive).
 *
 * The drain edits stubs, scaffolds `provisional/` stubs, and flushes homeless
 * captures to the shared inbox — all shared base-branch paths. Those writes
 * must originate from a **base-branch write context**, never a work-unit
 * worktree's branch, or they land on the wrong branch and tangle an unrelated
 * WU's PR with grooming.
 *
 * {@link classifyWriteContext} is the pure decision (current branch vs. the
 * configured base, mirroring `isProtectedBranch`); {@link resolveWriteContext}
 * is the thin I/O wrapper that resolves the live git context — the same context
 * `arc errand` resolves (primary worktree path, current branch, `branch.base`).
 *
 * @module
 */

import { errandSlugOf } from "../session-init/errand-branch.js";
import { getCurrentBranch } from "./exec.js";
import { resolvePrimaryWorktreePath } from "./worktree-roster.js";

import type { GitExec } from "./exec.js";

/**
 * Which path surface a write targets — the dimension foreign-write reasoning
 * keys on, orthogonal to the proceed/relocate/refuse axis:
 *
 * - `cohort-doc` — a `cohort-*.md`, the deliberate multi-owner exception to
 *   per-worktree isolation; the behind-base detector is its net, not the
 *   single-owner foreign-write gate.
 * - `work-unit` — a per-WU movable artifact (`meta|spec|draft|tasks|notes-*.md`);
 *   the single-owner surface the foreign-write gate keys on.
 * - `other` — code, READMEs, shared inboxes / ROADMAP: no single-owner semantics.
 */
export type PathSurface = "cohort-doc" | "work-unit" | "other";

/**
 * The two concurrency dimensions carried on every verdict, independent of the
 * proceed/relocate/refuse axis: the classified surface of the targeted write
 * (`null` when the check is path-agnostic) and the errand slug when the write
 * originates from a `chore/<slug>` branch (`null` otherwise).
 */
interface WriteContextDimensions {
  /** Classified surface of the target path, or `null` when none was supplied. */
  pathSurface: PathSurface | null;
  /** Errand slug when the current branch is `chore/<slug>`, else `null`. */
  errandSlug: string | null;
}

/**
 * The classified write context. `verdict` is the discriminant the caller acts
 * on: `proceed` (base-branch context), `relocate` (on a WU branch — refuse and
 * offer to hop to a base-branch context), or `refuse` (degenerate context — a
 * safe refusal, never a silent write). The {@link WriteContextDimensions} ride
 * alongside, classifying the write itself rather than the branch context.
 */
export type WriteContext = WriteContextDimensions & (
  | {
      verdict: "proceed";
      currentBranch: string;
      baseBranch: string;
      primaryWorktreePath: string | null;
    }
  | {
      verdict: "relocate";
      currentBranch: string;
      baseBranch: string;
      primaryWorktreePath: string | null;
    }
  | {
      verdict: "refuse";
      reason: "detached-head" | "no-base";
      currentBranch: string | null;
      baseBranch: string | null;
      primaryWorktreePath: string | null;
    }
);

/** Resolved facts {@link classifyWriteContext} decides against. */
export interface WriteContextInput {
  /** Current branch, or `null` when detached (no branch identity to write from). */
  currentBranch: string | null;
  /** Configured `branch.base`, or `null` when unset/empty. */
  baseBranch: string | null;
  /** Primary worktree path — the relocate target; carried for messaging. */
  primaryWorktreePath: string | null;
  /**
   * Repo-relative path the write targets, classified into the verdict's
   * `pathSurface`. Optional: a path-agnostic check (the `housekeep` drain
   * resolves the branch context without a specific target) omits it and gets a
   * `null` surface rather than a spurious classification.
   */
  targetPath?: string | null;
}

/** A `.arc/` path segment anchors a path to the project's planning surfaces. */
const ARC_ROOT_MARKER = /(?:^|\/)\.arc\//;

/** Cohort-doc filename convention — the multi-owner exception. */
const COHORT_DOC_BASENAME = /^cohort-.+\.md$/;

/** Per-WU movable-artifact filename conventions — the single-owner surfaces. */
const WORK_UNIT_BASENAME = /^(?:meta|spec|draft|tasks|notes)-.+\.md$/;

/**
 * Classify which {@link PathSurface} a repo-relative path targets. Keyed on the
 * `.arc/` artifact naming conventions, scoped to `.arc/` so an artifact-named
 * file elsewhere in the tree (e.g. a `notes-*.md` doc in source) is not
 * mistaken for a planning surface.
 *
 * @param path - A repo-relative path (POSIX or Windows separators).
 * @returns The classified surface.
 */
export function classifyPathSurface(path: string): PathSurface {
  const posix = path.replace(/\\/g, "/");
  if (!ARC_ROOT_MARKER.test(posix)) return "other";
  const basename = posix.slice(posix.lastIndexOf("/") + 1);
  if (COHORT_DOC_BASENAME.test(basename)) return "cohort-doc";
  if (WORK_UNIT_BASENAME.test(basename)) return "work-unit";
  return "other";
}

/**
 * Classify a write context from resolved git facts. Keyed on **write context**
 * (current branch vs. base), not on the absence of an active work unit — so a
 * base-branch invocation proceeds even mid-WU. The path-surface and errand-slug
 * dimensions are computed independently of the branch-context axis and ride on
 * every verdict.
 *
 * @param input - Resolved current branch, base branch, primary worktree path,
 *   and the optional target path.
 * @returns The classified context with its `verdict` and concurrency dimensions.
 */
export function classifyWriteContext(input: WriteContextInput): WriteContext {
  const { currentBranch, baseBranch, primaryWorktreePath, targetPath } = input;
  const dimensions: WriteContextDimensions = {
    pathSurface: targetPath != null ? classifyPathSurface(targetPath) : null,
    errandSlug: errandSlugOf(currentBranch),
  };
  if (currentBranch === null) {
    return { ...dimensions, verdict: "refuse", reason: "detached-head", currentBranch: null, baseBranch, primaryWorktreePath };
  }
  if (baseBranch === null || baseBranch === "") {
    return { ...dimensions, verdict: "refuse", reason: "no-base", currentBranch, baseBranch: null, primaryWorktreePath };
  }
  if (currentBranch === baseBranch) {
    return { ...dimensions, verdict: "proceed", currentBranch, baseBranch, primaryWorktreePath };
  }
  return { ...dimensions, verdict: "relocate", currentBranch, baseBranch, primaryWorktreePath };
}

/**
 * Branch-protection mode resolved from `branch.protection`. Unknown / unset
 * values degrade to `partial` (the fail-safe floor) at the resolution boundary,
 * so the classifier only ever sees the two real modes.
 */
export type ProtectionMode = "full" | "partial";

/**
 * Why a planning-entry context is not committable — the discriminant the
 * `arc-plan` workflow words the redirect surface from.
 *
 * - `protected-base` — full protection, HEAD on the base branch: a draft cannot
 *   commit to a protected base; begin a planning branch or stub instead.
 * - `work-unit-branch` — HEAD on another work unit's branch: drafting a new
 *   design here would tangle that unit's PR.
 * - `detached-head` / `no-base` — degenerate contexts propagated from the
 *   branch-vs-base core ({@link WriteContext} `refuse`).
 */
export type PlanningRedirectReason =
  | "protected-base"
  | "work-unit-branch"
  | "detached-head"
  | "no-base";

/**
 * Resolved facts {@link classifyPlanningEntry} decides against — the planning
 * routing layer over the branch-vs-base {@link WriteContext} core.
 */
export interface PlanningEntryInput {
  /** The branch-vs-base core verdict from {@link classifyWriteContext}. */
  writeContext: WriteContext;
  /** Resolved `branch.protection` (unknown/unset already degraded to `partial`). */
  protection: ProtectionMode;
  /**
   * Full-mode committability signal: this worktree holds an active
   * `Planning`-state work unit and HEAD is on its planning branch — the one
   * place a draft commits under full protection. Always `false` under partial,
   * where committability keys on the base branch instead.
   */
  onPlanningBranch: boolean;
  /** A `draft-*` for the intended design already exists — parameterizes the stub leg's fold-in. */
  draftPresent: boolean;
  /** An active work unit occupies this worktree — a surfaced fact for the redirect choice. */
  activeWorkUnit: boolean;
}

/**
 * The planning-entry route — the two-layer gate's verdict.
 *
 * - `proceed` (layer 1) — the context is committable for a draft; author here.
 * - `redirect` (layer 2) — not committable. The `arc-plan` workflow surfaces
 *   start / stub / errand by WU-worthiness; `draftPresent` parameterizes the
 *   stub leg's fold-in. The CLI resolves committability mechanically and never
 *   fabricates the WU-worthiness judgment — it only carries the facts the
 *   workflow words the choice from.
 */
export type PlanningEntryRoute =
  | {
      route: "proceed";
      protection: ProtectionMode;
      currentBranch: string;
    }
  | {
      route: "redirect";
      protection: ProtectionMode;
      reason: PlanningRedirectReason;
      draftPresent: boolean;
      activeWorkUnit: boolean;
      currentBranch: string | null;
      baseBranch: string | null;
      primaryWorktreePath: string | null;
    };

/**
 * Classify the planning-entry route — the mechanical preflight `arc-plan` runs
 * before `draft-design`, layered over the branch-vs-base {@link WriteContext}
 * core. Committability (layer 1) is mode-shaped: under `partial` a draft commits
 * on the base branch; under `full` it commits on an active `Planning` work
 * unit's planning branch. A non-committable context yields a `redirect` carrying
 * the facts the workflow surfaces start / stub / errand from — the leg choice is
 * WU-worthiness judgment, never decided here.
 *
 * @param input - The branch-vs-base verdict plus the resolved planning facts.
 * @returns The two-layer planning-entry route.
 */
export function classifyPlanningEntry(input: PlanningEntryInput): PlanningEntryRoute {
  const { writeContext, protection, onPlanningBranch, draftPresent, activeWorkUnit } = input;

  // A degenerate branch-vs-base context (detached / no base) is non-committable
  // in either mode — propagate its reason straight to a redirect.
  if (writeContext.verdict === "refuse") {
    return {
      route: "redirect",
      protection,
      reason: writeContext.reason,
      draftPresent,
      activeWorkUnit,
      currentBranch: writeContext.currentBranch,
      baseBranch: writeContext.baseBranch,
      primaryWorktreePath: writeContext.primaryWorktreePath,
    };
  }

  // Layer 1 — committable for a draft, given protection mode.
  const committable =
    protection === "partial" ? writeContext.verdict === "proceed" : onPlanningBranch;
  if (committable) {
    return { route: "proceed", protection, currentBranch: writeContext.currentBranch };
  }

  // Layer 2 — not committable. Word why; the workflow surfaces the leg choice.
  const reason: PlanningRedirectReason =
    protection === "full" && writeContext.verdict === "proceed"
      ? "protected-base"
      : "work-unit-branch";
  return {
    route: "redirect",
    protection,
    reason,
    draftPresent,
    activeWorkUnit,
    currentBranch: writeContext.currentBranch,
    baseBranch: writeContext.baseBranch,
    primaryWorktreePath: writeContext.primaryWorktreePath,
  };
}

/** Git reads {@link resolveWriteContext} needs, plus the resolved base branch. */
export interface ResolveWriteContextOptions {
  exec: GitExec;
  /** Configured `branch.base` (read by the caller from config), or `null` when unset. */
  baseBranch: string | null;
  /** Optional repo-relative target path, classified into the verdict's `pathSurface`. */
  targetPath?: string | null;
}

/**
 * Resolve the live write context and classify it. Resolves the current branch
 * and primary worktree path via git, then defers to {@link classifyWriteContext}.
 *
 * @param options - Git executor, the caller-resolved `branch.base`, and an
 *   optional target path.
 * @returns The classified write context.
 */
export async function resolveWriteContext(options: ResolveWriteContextOptions): Promise<WriteContext> {
  const { exec, baseBranch, targetPath } = options;
  const currentBranch = await getCurrentBranch(exec);
  const primaryWorktreePath = await resolvePrimaryWorktreePath(exec);
  return classifyWriteContext({ currentBranch, baseBranch, primaryWorktreePath, targetPath });
}
