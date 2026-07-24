/** Shared exact-commit baseline loading for reproducible Markdown migration audits. */

import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { enumerateTrackedMarkdownPaths, validateExplicitMarkdownPaths } from "./selection.js";

/** Filesystem and Git boundaries for preparing a Markdown migration audit. */
export interface PrepareMarkdownMigrationAuditOptions {
  readonly root: string;
  readonly paths?: readonly string[];
  readonly exec: GitExec;
  readonly lstat: (path: string) => Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;
  readonly realpath: (path: string) => Promise<string>;
  readonly readBaseline: (ref: string, path: ManagedPath) => Promise<Uint8Array | null>;
  readonly readBytes: (path: ManagedPath) => Promise<Uint8Array>;
}

/** One selected file loaded from an immutable baseline and the current worktree. */
export interface MarkdownMigrationFile {
  readonly path: ManagedPath;
  readonly baseline: Uint8Array;
  readonly candidate: Uint8Array;
}

/** Exact baseline commit and selected file inputs for a migration proof. */
export interface MarkdownMigrationInputs {
  readonly head: string;
  readonly files: readonly MarkdownMigrationFile[];
}

/** Pin HEAD and load exact baseline/current bytes for an authority-selected Markdown scope. */
export async function prepareMarkdownMigrationInputs(
  options: PrepareMarkdownMigrationAuditOptions,
): Promise<MarkdownMigrationInputs> {
  let head: string;
  try {
    const result = await options.exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: options.root });
    head = result.stdout.trim();
  } catch (error) {
    throw new ArcError("Cannot resolve the Markdown migration baseline commit", "markdown.audit-head", {
      cause: error,
    });
  }
  if (!/^[0-9a-f]{40,64}$/u.test(head)) {
    throw new ArcError("Git returned an invalid Markdown migration baseline commit", "markdown.audit-head");
  }

  const paths = options.paths === undefined
    ? await enumerateTrackedMarkdownPaths({ root: options.root, exec: options.exec, source: "worktree" })
    : await validateExplicitMarkdownPaths({
        root: options.root,
        paths: options.paths,
        operation: "worktree-read",
        exec: options.exec,
        lstat: options.lstat,
        realpath: options.realpath,
      });
  const files: MarkdownMigrationFile[] = [];
  for (const path of paths) {
    const baseline = await options.readBaseline(head, path);
    if (baseline === null) {
      throw new ArcError(`Cannot load the Markdown migration baseline for ${path}`, "markdown.audit-baseline");
    }
    files.push({ path, baseline, candidate: await options.readBytes(path) });
  }
  return { head, files };
}
