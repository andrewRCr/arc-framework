/** Explicit shared-selector worktree execution for markdownlint-cli2. */

import { relative, resolve, sep } from "node:path";

import type { GitExec } from "../git/index.js";
import type { RawGitExec } from "../git/exec.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath } from "./authority.js";
import { loadWorktreeMarkdownConfigurations } from "./configuration.js";
import { selectMarkdownlintPaths } from "./lint-selection.js";
import { enumerateTrackedMarkdownPaths, validateExplicitMarkdownPaths,
  type ValidateExplicitMarkdownPathsOptions } from "./selection.js";

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


/** Filesystem boundaries and explicit operands for focused worktree linting. */
export interface RunExplicitMarkdownlintOptions extends RunWorktreeMarkdownlintOptions {
  readonly paths: readonly string[];
  readonly allowIgnored?: boolean;
  readonly rawGit: RawGitExec;
  readonly lstat: ValidateExplicitMarkdownPathsOptions["lstat"];
  readonly realpath: ValidateExplicitMarkdownPathsOptions["realpath"];
}

/**
 * Refuse every excluded or unreadable operand before running the native linter.
 * @param options - Repository, explicit file operands, and filesystem/process boundaries
 * @returns Native lint status and the complete validated selection
 */
export async function runExplicitMarkdownlint(
  options: RunExplicitMarkdownlintOptions,
): Promise<WorktreeMarkdownlintResult> {
  const candidates = options.paths.map(path => validateMarkdownPath(
    relative(options.root, resolve(options.root, path)).split(sep).join("/"),
  ));
  const included = new Set(await selectMarkdownlintPaths(options.root, candidates, options.rawGit));
  for (const path of candidates) {
    if (!included.has(path)) {
      throw new ArcError(
        `Markdown path is excluded by .markdownlint-cli2.jsonc: ${path}. Choose an included Markdown file.`,
        "markdown.excluded",
      );
    }
  }
  const paths = await validateExplicitMarkdownPaths({ ...options, paths: candidates, operation: "lint-read",
    allowIgnoredPaths: options.allowIgnored ? new Set(candidates) : undefined });
  await loadWorktreeMarkdownConfigurations({ ...options, markdownPaths: paths });
  const exitCode = await options.executeLinter(options.root, ["--no-globs", "--", ...paths.map(path => `:${path}`)]);
  return { exitCode, paths };
}
