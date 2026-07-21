/** Reproducible evidence checks for completed GFM table migrations. */

import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import type { MarkdownChangedRange } from "./contracts.js";
import { validateMarkdownPath } from "./authority.js";
import { enumerateTrackedMarkdownPaths, validateExplicitMarkdownPaths } from "./selection.js";
import { transformGfmTables, verifyGfmTableRewrite } from "./table-transform.js";

/** Inputs captured for one migrated Markdown file. */
export interface AuditTableMigrationFileInput {
  readonly path: string;
  readonly baseline: Uint8Array;
  readonly candidate: Uint8Array;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

/** Reproducible per-file migration evidence. */
export interface TableMigrationFileAudit {
  readonly path: ManagedPath;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

/** Complete audit evidence pinned to one immutable baseline commit. */
export interface TableMigrationAudit {
  readonly head: string;
  readonly files: readonly TableMigrationFileAudit[];
}

/** Filesystem and Git boundaries for preparing a migration audit. */
export interface PrepareTableMigrationAuditOptions {
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

/** Verify and retain the complete range evidence for one table-only migration. */
export function auditTableMigrationFile(input: AuditTableMigrationFileInput): TableMigrationFileAudit {
  const path = validateMarkdownPath(input.path);
  verifyGfmTableRewrite({ ...input, path });
  return { path, changedRanges: input.changedRanges };
}

/** Pin HEAD, load exact Git baselines, and audit current bytes for the complete selected scope. */
export async function prepareTableMigrationAudit(
  options: PrepareTableMigrationAuditOptions,
): Promise<TableMigrationAudit> {
  let head: string;
  try {
    const result = await options.exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: options.root });
    head = result.stdout.trim();
  } catch (error) {
    throw new ArcError("Cannot resolve the table migration baseline commit", "markdown.audit-head", { cause: error });
  }
  if (!/^[0-9a-f]{40,64}$/u.test(head)) {
    throw new ArcError("Git returned an invalid table migration baseline commit", "markdown.audit-head");
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
  const files: TableMigrationFileAudit[] = [];
  for (const path of paths) {
    const baseline = await options.readBaseline(head, path);
    if (baseline === null) {
      throw new ArcError(`Cannot load the table migration baseline for ${path}`, "markdown.audit-baseline");
    }
    const candidate = await options.readBytes(path);
    const transformed = transformGfmTables({ path, bytes: baseline });
    files.push(auditTableMigrationFile({
      path,
      baseline,
      candidate,
      changedRanges: transformed.changedRanges,
    }));
  }
  return { head, files };
}
