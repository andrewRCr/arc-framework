/** Exact Markdown fix corpus and mutation planning before any tool execution. */
import type { RawGitExec } from "../git/exec.js";
import type { GitExec } from "../git/index.js";
import { join, relative, resolve, sep } from "node:path";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import type { ProjectedSelectionReader } from "../checks/projected-selection.js";
import { enumerateTrackedMarkdownPaths, validateExplicitMarkdownPaths, type ValidateExplicitMarkdownPathsOptions } from "./selection.js";
import { loadWorktreeMarkdownConfigurations } from "./configuration.js";
import { selectMarkdownlintPaths } from "./lint-selection.js";
import { validateMarkdownPath } from "./authority.js";

/** Repository boundaries shared by fix selection and write validation. */
export interface MarkdownFixIO {
  exec: GitExec;
  rawGit: RawGitExec;
  readProjectedSelection: ProjectedSelectionReader;
  lstat: ValidateExplicitMarkdownPathsOptions["lstat"];
  realpath: ValidateExplicitMarkdownPathsOptions["realpath"];
  readText(path: string): Promise<string>;
}

/** Complete admitted corpus and the paths whose ignored membership the supplier authorizes. */
export interface MarkdownFixCorpus {
  paths: readonly ManagedPath[];
  projectedPaths: ReadonlySet<string>;
}

/** Validated writable files and explicit reports for listed paths that cannot be written. */
export interface MarkdownFixPlan {
  paths: readonly ManagedPath[];
  skipped: readonly { path: string; reason: string }[];
}

/** Validate the complete explicit subset and every write before returning a mutating plan. */
export async function prepareMarkdownFix(root: string, io: MarkdownFixIO,
  paths?: readonly string[]): Promise<MarkdownFixPlan> {
  const corpus = await resolveMarkdownFixCorpus(root, io);
  const candidates = paths === undefined ? corpus.paths : [...new Set(paths.map(path =>
    validateMarkdownPath(relative(root, resolve(root, path)).split(sep).join("/"))))];
  const members = new Set(corpus.paths);
  for (const path of candidates) {
    if (members.has(path)) continue;
    const admitted = await selectMarkdownlintPaths(root, [path], io.rawGit);
    const reason = admitted.length === 0 ? "excluded by the Markdown selection" : "absent from Git and the projected selection";
    throw new ArcError(`Cannot fix ${path}: outside the lint corpus (${reason}). Choose a listed path and retry.`,
      "markdown.excluded-path");
  }
  const writable: ManagedPath[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const path of candidates) {
    try {
      await validateExplicitMarkdownPaths({ ...io, root, paths: [path], operation: "mutate",
        allowIgnoredPaths: corpus.projectedPaths });
      writable.push(path);
    } catch (error) {
      skipped.push({ path, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  if (writable.length > 0) await loadWorktreeMarkdownConfigurations({ ...io, root, markdownPaths: writable });
  return { paths: writable, skipped };
}

/** Resolve the full Git-plus-projected lint corpus before any mutation. */
export async function resolveMarkdownFixCorpus(root: string, io: MarkdownFixIO): Promise<MarkdownFixCorpus> {
  const selection = await Promise.resolve().then(() => io.readProjectedSelection(root, { changed: false }))
    .catch((error: unknown) => ({ status: "unavailable" as const, reason: String(error) }));
  if (selection.status === "unavailable") {
    throw new ArcError(`Cannot read projected Markdown selection: ${selection.reason}. Repair the selection and retry.`,
      "markdown.selection-unavailable");
  }
  const projectedPaths = new Set(selection.paths.map(validateMarkdownPath));
  const tracked = await enumerateTrackedMarkdownPaths({ root, exec: io.exec, source: "worktree" })
    .catch((error: unknown): readonly ManagedPath[] => {
      if (error instanceof ArcError && error.code === "markdown.empty-selection") return [];
      throw error;
    });
  const present: ManagedPath[] = [];
  for (const path of tracked) {
    try {
      await io.lstat(join(root, path));
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") continue;
      // Retain other stat failures for write validation to report as unsafe.
    }
    present.push(path);
  }
  const paths = await selectMarkdownlintPaths(root, [...new Set([...present, ...projectedPaths])], io.rawGit);
  return { paths, projectedPaths };
}
