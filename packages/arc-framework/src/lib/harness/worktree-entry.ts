/**
 * Harness-facing entry recipes for ARC-created worktrees.
 *
 * ARC can make a spawned worktree ready and self-describing, but entering that
 * worktree is harness-owned: some harnesses can relocate a live session, while
 * others start a fresh session rooted at the worktree path.
 *
 * @module
 */

/** Parameters for {@link renderWorktreeEntryRecipe}. */
export interface WorktreeEntryRecipeParams {
  /** Absolute or user-visible worktree root emitted by the start/resume command. */
  worktreePath: string;
}

/**
 * Render the common worktree-entry invariant plus known harness recipes.
 *
 * @param params - Spawned worktree root.
 * @returns Human-readable recipe text suitable for a CLI note body.
 */
export function renderWorktreeEntryRecipe(params: WorktreeEntryRecipeParams): string {
  const pathArg = shellArg(params.worktreePath);
  return [
    "Enter the spawned worktree root above; post-create provisioning and registered harness-dir copy have run.",
    "Claude Code: use `EnterWorktree` with this path, then run `/arc-session`.",
    `Codex CLI: open a fresh terminal or end this session, then run \`codex --cd ${pathArg}\` and invoke \`$arc-session\`.`,
    "Other harnesses: start the harness from this worktree root, then invoke its ARC session entry.",
  ].join("\n");
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)
    ? value
    : `'${value.replace(/'/gu, "'\\''")}'`;
}
