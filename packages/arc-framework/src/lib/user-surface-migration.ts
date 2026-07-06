/**
 * Identity-global user-surface migration for linked worktree teardown.
 *
 * Linked worktrees created before identity-global user surfaces were bound to
 * the primary checkout can still hold ignored flat files under `.arc/user/*`.
 * Git sees those worktrees as clean, so teardown must reconcile mergeable files
 * into the primary materialization, discard generated caches, or refuse when a
 * divergent flat file has no safe merge strategy.
 *
 * @module
 */

import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { classifyUserSyncPath } from "./user-sync/classifier.js";
import { mergeCrossWuFile } from "./user-sync/merge.js";
import { shapeForFile } from "./user-sync/parser.js";

/** Directory-entry subset needed by the migration scan. */
export interface UserSurfaceMigrationDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/** Filesystem seam for identity-global user-surface migration. */
export interface UserSurfaceMigrationFs {
  readDir(path: string): Promise<UserSurfaceMigrationDirent[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  /** Remove a file. Only invoked when signposting retires a regenerable cache. */
  removeFile?(path: string): Promise<void>;
}

/** Production filesystem adapter for user-surface migration scans. */
export const nodeUserSurfaceMigrationFs: UserSurfaceMigrationFs = {
  readDir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
  writeFile,
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
  removeFile: (path) => rm(path, { force: true }),
};

/** Result of scanning and optionally reconciling a linked worktree's flat user files. */
export type LinkedIdentityGlobalUserSurfaceResult =
  | { status: "ok"; reconciled: string[]; signposted: string[] }
  | { status: "blocked"; reason: string };

export interface ReconcileLinkedIdentityGlobalUserSurfacesOptions {
  /** Linked worktree about to be removed. */
  worktreePath: string;
  /** Primary worktree that owns identity-global user-surface materialization. */
  primaryWorktreePath: string;
  fs: UserSurfaceMigrationFs;
  /** Inspect only; do not write canonical files. */
  dryRun?: boolean;
  /**
   * After merging a linked copy up, retire it in place: durable surfaces become an
   * explanatory signpost stub, regenerable caches are removed. Off by default (the
   * teardown caller deletes the whole worktree; the dry-run safety probe inspects only).
   */
  signpost?: boolean;
}

const LEGACY_ROOT_SESSION_NOTES = "SESSION-NOTES.md";
const DISCARDABLE_GENERATED_CACHES = new Set(["STATUS.USER.md"]);

/** First-line marker identifying a retired identity-global surface stub. */
const SIGNPOST_SENTINEL = "<!-- arc:signpost";

/**
 * Whether a file's content is a signpost stub this module previously wrote.
 *
 * The scan skips stubs so their notice text is never merged into canonical and a
 * stub is never re-stamped; replacing a stub with real content (dropping the
 * sentinel) opts the file back into the merge-up path.
 *
 * @param content - File content to test
 * @returns `true` when the content leads with the signpost sentinel
 */
export function isSignpostStub(content: string): boolean {
  return content.trimStart().startsWith(SIGNPOST_SENTINEL);
}

function isDiscardableGeneratedCache(filename: string): boolean {
  return DISCARDABLE_GENERATED_CACHES.has(filename);
}

/**
 * Build the in-place notice left where a linked worktree's durable identity-global
 * surface used to live — naming the canonical primary-worktree copy for content and
 * `arc user status` for drift, so a direct read finds "not here, and why."
 */
function buildSignpostStub(params: { filename: string; canonicalPath: string }): string {
  const { filename, canonicalPath } = params;
  return [
    `${SIGNPOST_SENTINEL} surface=${filename} -->`,
    `# ${filename} — not materialized in this worktree`,
    "",
    "This is a **linked worktree**. Identity-global user surfaces are canonical on the",
    "**primary** worktree and resolve there automatically — ARC reads and writes the",
    "canonical copy for you, so nothing here needs editing.",
    "",
    `- Content: \`${canonicalPath}\``,
    "- Status / drift: `arc user status`",
    "",
    "_This is a signpost, not the surface. View or edit the canonical copy above; ARC",
    "already routes reads and writes there._",
    "",
  ].join("\n");
}

/**
 * Dry-run safety predicate for cleanup-offer probes.
 *
 * @param options - Candidate worktree, primary root, and filesystem seam
 * @returns `true` only when ignored identity-global files are absent or safely mergeable
 */
export async function linkedIdentityGlobalUserSurfacesAreSafe(options: {
  worktreePath: string;
  primaryWorktreePath: string | null;
  fs: UserSurfaceMigrationFs;
}): Promise<boolean> {
  if (options.primaryWorktreePath === null) return false;
  try {
    const result = await reconcileLinkedIdentityGlobalUserSurfaces({
      worktreePath: options.worktreePath,
      primaryWorktreePath: options.primaryWorktreePath,
      fs: options.fs,
      dryRun: true,
    });
    return result.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Reconcile a linked worktree's flat identity-global user files into the
 * primary worktree, or report the first file that cannot be merged safely.
 *
 * Known cross-WU files use the same entry-union merge as notes sync, with the
 * primary copy as the base so a stale linked copy cannot overwrite canonical
 * entries. Generated cache files are disposable because their source of truth is
 * the renderer, not the stale linked-worktree copy. Unknown flat files copy over
 * only when the primary lacks the file; divergent unknown files block removal.
 *
 * @param options - Worktree roots, filesystem seam, and optional dry-run mode
 * @returns Reconciled file labels, or a blocking reason
 */
export async function reconcileLinkedIdentityGlobalUserSurfaces(
  options: ReconcileLinkedIdentityGlobalUserSurfacesOptions,
): Promise<LinkedIdentityGlobalUserSurfaceResult> {
  const { worktreePath, primaryWorktreePath, fs, dryRun = false, signpost = false } = options;
  if (resolve(worktreePath) === resolve(primaryWorktreePath)) {
    return { status: "ok", reconciled: [], signposted: [] };
  }

  const linkedUserRoot = join(worktreePath, ".arc", "user");
  const canonicalUserRoot = join(primaryWorktreePath, ".arc", "user");
  const identities = (await readDirOrEmpty(fs, linkedUserRoot)).filter((entry) => entry.isDirectory());
  const reconciled: string[] = [];
  const signposted: string[] = [];

  for (const identityEntry of identities) {
    const identity = identityEntry.name;
    const linkedIdentityRoot = join(linkedUserRoot, identity);
    const canonicalIdentityRoot = join(canonicalUserRoot, identity);
    const entries = (await readDirOrEmpty(fs, linkedIdentityRoot)).filter((entry) => entry.isFile());

    for (const entry of entries) {
      if (!isIdentityGlobalFilename(entry.name)) continue;

      const linkedPath = join(linkedIdentityRoot, entry.name);
      const canonicalPath = join(canonicalIdentityRoot, entry.name);
      const linkedContent = await fs.readFile(linkedPath);
      // A copy already reduced to a signpost stub carries no user content: never
      // merge the notice text into canonical, and never re-stamp an existing stub.
      if (isSignpostStub(linkedContent)) continue;

      const canonicalContent = await readFileIfExists(fs, canonicalPath);
      const fileLabel = `${identity}/${entry.name}`;
      const resolvedFile = reconcileIdentityGlobalFile(entry.name, fileLabel, canonicalContent, linkedContent);
      if (resolvedFile.status === "blocked") return resolvedFile;

      if (resolvedFile.content !== null) {
        reconciled.push(fileLabel);
        if (!dryRun) {
          await fs.mkdir(canonicalIdentityRoot, { recursive: true });
          await fs.writeFile(canonicalPath, resolvedFile.content);
        }
      }

      // Canonical is now authoritative, so retire the linked copy: a durable surface
      // leaves an explanatory stub, a regenerable cache is removed. Both close the
      // stale-read / write-to-wrong-copy window a lingering copy would keep open.
      if (signpost && !dryRun) {
        if (isDiscardableGeneratedCache(entry.name)) {
          await fs.removeFile?.(linkedPath);
        } else {
          await fs.writeFile(linkedPath, buildSignpostStub({ filename: entry.name, canonicalPath }));
          signposted.push(fileLabel);
        }
      }
    }
  }

  return { status: "ok", reconciled, signposted };
}

function isIdentityGlobalFilename(filename: string): boolean {
  return classifyUserSyncPath(filename) === "cross-wu" && filename !== LEGACY_ROOT_SESSION_NOTES;
}

function reconcileIdentityGlobalFile(
  filename: string,
  fileLabel: string,
  canonicalContent: string | null,
  linkedContent: string,
): { status: "ok"; content: string | null } | { status: "blocked"; reason: string } {
  if (DISCARDABLE_GENERATED_CACHES.has(filename)) return { status: "ok", content: null };
  if (canonicalContent === null) return { status: "ok", content: linkedContent };
  if (canonicalContent === linkedContent) return { status: "ok", content: null };

  const shape = shapeForFile(filename);
  if (shape === null) {
    return {
      status: "blocked",
      reason:
        `identity-global user surface \`${fileLabel}\` differs from the canonical root and has no merge ` +
        "strategy; reconcile it before removing the worktree.",
    };
  }

  const merged = mergeCrossWuFile(filename, [{ content: canonicalContent }, { content: linkedContent }]);
  if (merged.malformed.length > 0) {
    return {
      status: "blocked",
      reason:
        `identity-global user surface \`${fileLabel}\` has malformed entries that cannot be safely merged; ` +
        "repair or save it before removing the worktree.",
    };
  }
  return merged.content === canonicalContent ? { status: "ok", content: null } : { status: "ok", content: merged.content };
}

async function readDirOrEmpty(
  fs: UserSurfaceMigrationFs,
  path: string,
): Promise<UserSurfaceMigrationDirent[]> {
  try {
    return await fs.readDir(path);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return [];
    throw err;
  }
}

async function readFileIfExists(
  fs: UserSurfaceMigrationFs,
  path: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

function isErrnoException(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}
