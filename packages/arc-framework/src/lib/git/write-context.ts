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

import { getCurrentBranch } from "./exec.js";
import { resolvePrimaryWorktreePath } from "./worktree-roster.js";

import type { GitExec } from "./exec.js";

/**
 * The classified write context. `verdict` is the discriminant the caller acts
 * on: `proceed` (base-branch context), `relocate` (on a WU branch — refuse and
 * offer to hop to a base-branch context), or `refuse` (degenerate context — a
 * safe refusal, never a silent write).
 */
export type WriteContext =
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
    };

/** Resolved facts {@link classifyWriteContext} decides against. */
export interface WriteContextInput {
  /** Current branch, or `null` when detached (no branch identity to write from). */
  currentBranch: string | null;
  /** Configured `branch.base`, or `null` when unset/empty. */
  baseBranch: string | null;
  /** Primary worktree path — the relocate target; carried for messaging. */
  primaryWorktreePath: string | null;
}

/**
 * Classify a write context from resolved git facts. Keyed on **write context**
 * (current branch vs. base), not on the absence of an active work unit — so a
 * base-branch invocation proceeds even mid-WU.
 *
 * @param input - Resolved current branch, base branch, and primary worktree path.
 * @returns The classified context with its `verdict`.
 */
export function classifyWriteContext(input: WriteContextInput): WriteContext {
  const { currentBranch, baseBranch, primaryWorktreePath } = input;
  if (currentBranch === null) {
    return { verdict: "refuse", reason: "detached-head", currentBranch: null, baseBranch, primaryWorktreePath };
  }
  if (baseBranch === null || baseBranch === "") {
    return { verdict: "refuse", reason: "no-base", currentBranch, baseBranch: null, primaryWorktreePath };
  }
  if (currentBranch === baseBranch) {
    return { verdict: "proceed", currentBranch, baseBranch, primaryWorktreePath };
  }
  return { verdict: "relocate", currentBranch, baseBranch, primaryWorktreePath };
}

/** Git reads {@link resolveWriteContext} needs, plus the resolved base branch. */
export interface ResolveWriteContextOptions {
  exec: GitExec;
  /** Configured `branch.base` (read by the caller from config), or `null` when unset. */
  baseBranch: string | null;
}

/**
 * Resolve the live write context and classify it. Resolves the current branch
 * and primary worktree path via git, then defers to {@link classifyWriteContext}.
 *
 * @param options - Git executor plus the caller-resolved `branch.base`.
 * @returns The classified write context.
 */
export async function resolveWriteContext(options: ResolveWriteContextOptions): Promise<WriteContext> {
  const { exec, baseBranch } = options;
  const currentBranch = await getCurrentBranch(exec);
  const primaryWorktreePath = await resolvePrimaryWorktreePath(exec);
  return classifyWriteContext({ currentBranch, baseBranch, primaryWorktreePath });
}
