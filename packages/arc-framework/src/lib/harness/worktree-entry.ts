/**
 * Harness-facing entry recipe for ARC-created worktrees.
 *
 * ARC can make a spawned worktree ready and self-describing, but entering that
 * worktree is harness-owned. The universal path is a fresh session started in
 * the worktree — it boots rich off the seeded handoff. Relocating a live
 * session is an opt-in escape hatch: it moves only the agent process while the
 * developer's terminal and GUI stay pointed at the previous checkout.
 *
 * @module
 */

/** Parameters for {@link renderWorktreeEntryRecipe}. */
export interface WorktreeEntryRecipeParams {
  /** Absolute or user-visible worktree root emitted by the start/resume command. */
  worktreePath: string;
}

/**
 * Render the common worktree-entry invariant, the primary fresh-session path,
 * and the live-relocate escape hatch.
 *
 * The entry invocation is named (`arc-session`) but harness-agnostic — the
 * per-harness invocation prefix and any launch command are the developer's
 * tooling to arrange, not ARC's to emit.
 *
 * @param params - Spawned worktree root.
 * @returns Human-readable recipe text suitable for a CLI note body.
 */
export function renderWorktreeEntryRecipe(params: WorktreeEntryRecipeParams): string {
  return [
    "Enter the spawned worktree root above; post-create provisioning and registered harness-dir copy have run.",
    `Primary — start a fresh session in \`${params.worktreePath}\` with your harness of choice, then invoke ` +
      "`arc-session`; it boots rich off the seeded handoff.",
    "Escape hatch — if your harness can relocate a live session (e.g. Claude Code's `EnterWorktree`) and you " +
      "don't rely on terminal sync, relocate into this path and invoke `arc-session` instead; your terminal and " +
      "GUI stay pointed at the previous checkout.",
  ].join("\n");
}
