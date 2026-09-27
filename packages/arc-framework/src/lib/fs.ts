/**
 * Shared filesystem utilities for the ARC CLI.
 *
 * Directory traversal, file listing, and atomic write operations used across
 * commands.
 *
 * @module
 */

import { join, dirname, basename, relative } from "node:path";
import { readdir, stat, writeFile, rename, unlink, mkdir, link } from "node:fs/promises";
import { randomBytes } from "node:crypto";

import { retryTransientFileSystemRefusal } from "./kernel/fs-retry.js";
export { retryTransientFileSystemRefusal } from "./kernel/fs-retry.js";

/**
 * Write text or bytes to a file atomically using temp-file-then-rename.
 *
 * Creates a unique `.tmp` sibling in the same directory as the target, writes
 * the serialized content there, then renames over the target. On POSIX systems
 * `rename(2)` is atomic — the target is either the old content or the new
 * content, never a partial write. Same-directory placement avoids `EXDEV`
 * failures when `$TMPDIR` is on a different filesystem.
 *
 * The temp filename includes a random suffix so concurrent writers (parallel
 * sessions writing the same target) never share a temp file — each rename
 * promotes a fully-formed payload, so the target only ever transitions
 * between two valid records.
 *
 * @param targetPath - Absolute path to the file
 * @param content - Complete text or byte content to write
 */
export async function atomicWriteFile(targetPath: string, content: string | Uint8Array): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.${basename(targetPath)}.${randomBytes(8).toString("hex")}.tmp`);

  try {
    await writeFile(tmpPath, content, typeof content === "string" ? "utf-8" : undefined);
    await retryTransientFileSystemRefusal(async () => {
      await rename(tmpPath, targetPath);
    });
  } catch (err) {
    // Clean up temp file if it was created before the failure
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Write a JSON value to a file atomically using temp-file-then-rename.
 *
 * @param targetPath - Absolute path to the JSON file
 * @param data - Value to serialize (pretty-printed with 2-space indent + trailing newline)
 */
export async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  await atomicWriteFile(targetPath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Create a file exclusively, failing if it already exists.
 *
 * Uses the `wx` open flag (`O_CREAT | O_EXCL`): the create is atomic against
 * concurrent callers — exactly one writer wins, and every other gets an
 * `EEXIST` rejection. The parent directory is created if missing. Unlike
 * {@link atomicWriteJson}, this never overwrites — the existence check and the
 * create are one indivisible step, making it the primitive for
 * create-if-absent races (e.g. a converged machine identity).
 *
 * @param targetPath - Absolute path to create
 * @param content - File content to write
 * @throws A `NodeJS.ErrnoException` with `code === "EEXIST"` when the path already exists
 */
export async function exclusiveCreateFile(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, { flag: "wx" });
}

/** Filesystem and entropy boundaries for complete create-only publication. */
export interface AtomicCreateFileContext {
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
  writeFile: (path: string, content: string, options: { flag: "wx" }) => Promise<void>;
  link: (existingPath: string, newPath: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  randomId: () => string;
}

/**
 * Build a create-only writer over explicit filesystem boundaries.
 *
 * @param context - Directory, write, hard-link, cleanup, and entropy boundaries
 * @returns A writer that publishes only complete payloads without replacing an existing target
 */
export function createAtomicFileCreator(
  context: AtomicCreateFileContext,
): (targetPath: string, content: string) => Promise<void> {
  return async (targetPath, content) => {
    const directory = dirname(targetPath);
    const temporaryPath = join(
      directory,
      `.${basename(targetPath)}.${context.randomId()}.tmp`,
    );
    await context.mkdir(directory, { recursive: true });
    try {
      await context.writeFile(temporaryPath, content, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        await context.unlink(temporaryPath).catch(() => undefined);
      }
      throw error;
    }
    try {
      await context.link(temporaryPath, targetPath);
    } finally {
      await context.unlink(temporaryPath).catch(() => undefined);
    }
  };
}

const nodeAtomicCreateFile = createAtomicFileCreator({
  mkdir,
  writeFile: (path, content, options) => writeFile(path, content, options),
  link,
  unlink,
  randomId: () => randomBytes(8).toString("hex"),
});

/**
 * Publish a complete file generation only when the target is absent.
 *
 * @param targetPath - Absolute target path to create
 * @param content - Complete UTF-8 text payload
 * @returns A promise fulfilled after the complete payload is linked into place
 * @throws A filesystem error, including `EEXIST` when the target is already occupied
 */
export async function atomicCreateFile(targetPath: string, content: string): Promise<void> {
  await nodeAtomicCreateFile(targetPath, content);
}

/**
 * Normalize a path to use forward slashes regardless of platform.
 *
 * Used to ensure manifest keys and serialized paths are consistent across
 * Windows (backslash) and POSIX (forward slash) environments.
 *
 * @param p - Path string to normalize
 * @returns Path with all backslashes replaced by forward slashes
 */
export function toForwardSlash(p: string): string {
  return p.replaceAll("\\", "/");
}

/**
 * Recursively list files under a directory, returning paths relative to it.
 *
 * Skips the `system/.internal/` directory (framework bookkeeping, not user-facing) and
 * per-identity `user/{identity}/` directories (gitignored personal workspace).
 *
 * @param dir - Root directory to list
 * @returns Relative file paths
 */
export async function listArcFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return; // Directory doesn't exist
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = toForwardSlash(relative(dir, fullPath));
      // Skip system/.internal directory (framework bookkeeping)
      if (relPath === "system/.internal" || relPath.startsWith("system/.internal/")) continue;
      // Skip per-identity user directories (e.g., user/alice/) — these are
      // gitignored personal workspaces. Top-level user/ files like README.md
      // are included since they are tracked framework content.
      if (/^user\/[^/]+\//.test(relPath)) continue;
      let s;
      try {
        s = await stat(fullPath);
      } catch {
        continue; // Broken symlink, deleted between readdir and stat, etc.
      }
      if (s.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(relPath);
      }
    }
  }
  await walk(dir);
  return results;
}
