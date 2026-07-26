/** Detect staged Markdown gate paths whose worktree bytes no longer match the index. */

import type { GitExec } from "../git/index.js";
import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import {
  enumerateStagedMarkdownGatePaths,
  isMarkdownGateTriggerPath,
} from "./staged-gate.js";

/** Dependencies for staged-vs-worktree Markdown drift detection. */
export interface FindStagedMarkdownWorktreeDriftOptions {
  readonly root: string;
  readonly exec: GitExec;
}

/** Paths with unstaged worktree edits relative to the index (NUL-safe). */
export async function enumerateWorktreeIndexDriftPaths(
  root: string,
  exec: GitExec,
): Promise<readonly ManagedPath[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--name-only", "--no-renames", "--diff-filter=ACMRD", "-z"],
    { cwd: root },
  );
  return stdout.split("\0").filter(Boolean).map(validateManagedPath);
}

/**
 * Return staged Markdown-gate paths that also differ in the worktree.
 *
 * That is the false-green trap: `lint:md` reads worktree bytes while pre-commit
 * certifies the index via `lint:md:staged`.
 */
export async function findStagedMarkdownWorktreeDrift(
  options: FindStagedMarkdownWorktreeDriftOptions,
): Promise<readonly ManagedPath[]> {
  const [staged, drifted] = await Promise.all([
    enumerateStagedMarkdownGatePaths(options.root, options.exec),
    enumerateWorktreeIndexDriftPaths(options.root, options.exec),
  ]);
  const driftedSet = new Set<string>(drifted);
  return staged.filter((path) => driftedSet.has(path) && isMarkdownGateTriggerPath(path));
}

/** Stable operator-facing message for staged Markdown worktree/index drift. */
export function formatStagedMarkdownWorktreeDriftMessage(paths: readonly string[]): string {
  const listed = paths.map((path) => `  - ${path}`).join("\n");
  return [
    `Markdown worktree/index drift: ${String(paths.length)} staged path(s) differ in the worktree.`,
    "`npm run -s lint:md` reads worktree bytes; pre-commit certifies the git index via `lint:md:staged`.",
    "Re-stage the path(s), then run `npm run -s lint:md:staged` before commit:",
    listed,
  ].join("\n");
}
