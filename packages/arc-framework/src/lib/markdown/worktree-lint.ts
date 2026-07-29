/** Explicit shared-selector worktree execution for markdownlint-cli2. */

import type { GitExec } from "../git/index.js";
import type { ManagedPath } from "../kernel/index.js";
import { loadWorktreeMarkdownConfigurations } from "./configuration.js";
import { enumerateTrackedMarkdownPaths } from "./selection.js";

/** Worktree markdownlint process boundary. */
export type ExecuteMarkdownlint = (root: string, args: readonly string[]) => Promise<number>;

/** Dependencies for complete worktree markdownlint execution. */
export interface RunWorktreeMarkdownlintOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readText: (path: string) => Promise<string>;
  readonly executeLinter: ExecuteMarkdownlint;
}

/** Result of the explicit-path worktree markdownlint process. */
export interface WorktreeMarkdownlintResult {
  readonly exitCode: number;
  readonly paths: readonly ManagedPath[];
}

/**
 * Validate config parity, then lint every shared-selector worktree path explicitly —
 * including untracked non-ignored Markdown selected by the worktree Git view.
 */
export async function runWorktreeMarkdownlint(
  options: RunWorktreeMarkdownlintOptions,
): Promise<WorktreeMarkdownlintResult> {
  await loadWorktreeMarkdownConfigurations(options);
  const paths = await enumerateTrackedMarkdownPaths({
    root: options.root,
    exec: options.exec,
    source: "worktree",
  });
  const exitCode = await options.executeLinter(options.root, ["--no-globs", "--", ...paths]);
  return { exitCode, paths };
}
