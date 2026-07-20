/** Git and filesystem selection boundaries for repository Markdown operations. */

import type { realpath as realpathFn } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { isMarkdownPathExcluded, validateMarkdownPath } from "./authority.js";

/** Canonical repository Markdown selection mirrored by the root markdownlint config. */
export const MARKDOWN_SELECTION = {
  gitignore: false,
  globs: ["**/*.md"],
  ignores: [
    "**/node_modules/**",
    "**/.venv*/**",
    "**/venv/**",
    ".arc/completed/**",
    ".arc/user/**/WORKING-MEMORY.md",
    ".arc/user/**/USER-INBOX.md",
    ".arc/**/temp-*.md",
    "arc/**",
  ],
} as const;

interface MarkdownPathStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** Structural config validation result for one markdownlint config. */
export interface MarkdownSelectionValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** I/O boundaries for validating an explicit Markdown selection before content access. */
export interface ValidateExplicitMarkdownPathsOptions {
  readonly root: string;
  readonly paths: readonly string[];
  readonly operation: "mutate" | "worktree-read";
  readonly exec: GitExec;
  readonly lstat: (path: string) => Promise<MarkdownPathStat>;
  readonly realpath: typeof realpathFn;
}

/** Inputs for selecting the complete tracked Markdown corpus from one Git view. */
export interface EnumerateTrackedMarkdownPathsOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly source: "worktree" | "index";
}

/** Dependencies for resolving the repository that owns a Markdown operation. */
export interface MarkdownRepositoryRootOptions {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly realpath: typeof realpathFn;
}

function selectionError(message: string, code: `markdown.${Lowercase<string>}`): ArcError {
  return new ArcError(message, code);
}

function arraysEqual(left: unknown, right: readonly string[]): boolean {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

/**
 * Validate root selection equality or prohibit selection options in a nested config.
 *
 * @param candidate - Parsed markdownlint configuration
 * @param options - Whether this is the required repository-root configuration
 * @returns All structural selection errors
 */
export function validateMarkdownSelectionConfig(
  candidate: unknown,
  options: { readonly root: boolean },
): MarkdownSelectionValidationResult {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return { valid: false, errors: ["Markdown configuration must be an object"] };
  }
  const config = candidate as Record<string, unknown>;
  const errors: string[] = [];
  if (options.root) {
    if (config.gitignore !== MARKDOWN_SELECTION.gitignore) {
      errors.push("Root gitignore does not match the authoritative selector");
    }
    if (!arraysEqual(config.globs, MARKDOWN_SELECTION.globs)) {
      errors.push("Root globs do not match the authoritative selector in order");
    }
    if (!arraysEqual(config.ignores, MARKDOWN_SELECTION.ignores)) {
      errors.push("Root ignores do not match the authoritative selector in order");
    }
  } else {
    for (const option of ["gitignore", "globs", "ignores"] as const) {
      if (Object.hasOwn(config, option)) errors.push(`Nested configuration must not define ${option}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function assertNativePathContained(root: string, candidate: string, path: ManagedPath): void {
  const fromRoot = relative(root, candidate);
  if (
    fromRoot.length === 0
    || fromRoot === ".."
    || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot)
  ) {
    throw selectionError(`Markdown path escapes the repository: ${path}`, "markdown.outside-repository");
  }
}

/**
 * Validate explicit tracked Markdown paths and physical containment before any content loader runs.
 *
 * @param options - Repository root, candidate paths, operation policy, and injected boundaries
 * @returns Canonical repository-relative paths in caller order
 */
export async function validateExplicitMarkdownPaths(
  options: ValidateExplicitMarkdownPathsOptions,
): Promise<readonly ManagedPath[]> {
  if (options.paths.length === 0) {
    throw selectionError("At least one Markdown path is required", "markdown.empty-selection");
  }

  const paths = options.paths.map(validateMarkdownPath);
  for (const path of paths) {
    try {
      await options.exec("git", ["ls-files", "--error-unmatch", "--", path], { cwd: options.root });
    } catch (error) {
      throw new ArcError(`Markdown path is not tracked: ${path}`, "markdown.untracked", { cause: error });
    }

    let native = options.root;
    let finalStat: MarkdownPathStat | undefined;
    for (const segment of path.split("/")) {
      native = join(native, segment);
      let stat: MarkdownPathStat;
      try {
        stat = await options.lstat(native);
      } catch (error) {
        throw new ArcError(`Markdown path is missing or unreadable: ${path}`, "markdown.path-unreadable", {
          cause: error,
        });
      }
      if (options.operation === "mutate" && stat.isSymbolicLink()) {
        throw selectionError(`Mutating Markdown path contains a symbolic link: ${path}`, "markdown.symlink");
      }
      finalStat = stat;
    }
    if (finalStat === undefined || !finalStat.isFile() || finalStat.isDirectory()) {
      throw selectionError(`Markdown path is not a regular file: ${path}`, "markdown.not-file");
    }

    let physical: string;
    try {
      physical = await options.realpath(native);
    } catch (error) {
      throw new ArcError(`Markdown path cannot be resolved: ${path}`, "markdown.path-unreadable", { cause: error });
    }
    assertNativePathContained(options.root, physical, path);
  }
  return paths;
}

/**
 * Enumerate the canonical tracked Markdown scope without consulting worktree glob walkers.
 *
 * @param options - Repository root, Git boundary, and selected Git view
 * @returns NUL-safely decoded repository-relative paths in Git order
 */
export async function enumerateTrackedMarkdownPaths(
  options: EnumerateTrackedMarkdownPathsOptions,
): Promise<readonly ManagedPath[]> {
  let stdout: string;
  try {
    const args = options.source === "index" ? ["ls-files", "--cached", "-z"] : ["ls-files", "-z"];
    ({ stdout } = await options.exec("git", args, { cwd: options.root }));
  } catch (error) {
    throw new ArcError("Cannot enumerate the tracked Markdown scope", "markdown.selection-failed", {
      cause: error,
    });
  }

  const selected: ManagedPath[] = [];
  for (const rawPath of stdout.split("\0")) {
    if (rawPath.length === 0 || !rawPath.endsWith(".md")) continue;
    const path = validateMarkdownPath(rawPath);
    if (!isMarkdownPathExcluded(path)) selected.push(path);
  }
  if (selected.length === 0) {
    throw selectionError("The tracked Markdown selection is empty", "markdown.empty-selection");
  }
  return selected;
}

/**
 * Resolve and canonicalize the repository root through Git.
 *
 * @param options - Injected execution and filesystem boundaries
 * @returns Canonical native path to the Git top level
 */
export async function resolveMarkdownRepositoryRoot(
  options: MarkdownRepositoryRootOptions,
): Promise<string> {
  let root: string;
  try {
    const result = await options.exec("git", ["rev-parse", "--show-toplevel"], { cwd: options.cwd });
    root = result.stdout.trim();
  } catch (error) {
    throw new ArcError("Cannot resolve the repository root for Markdown operations", "markdown.repository-root", {
      cause: error,
    });
  }
  if (root.length === 0) {
    throw new ArcError("Git returned an empty repository root", "markdown.repository-root");
  }
  try {
    return await options.realpath(root);
  } catch (error) {
    throw new ArcError("Cannot canonicalize the repository root", "markdown.repository-root", { cause: error });
  }
}
