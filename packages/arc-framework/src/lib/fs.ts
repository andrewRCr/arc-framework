/**
 * Shared filesystem utilities for the ARC CLI.
 *
 * Directory traversal, file listing, and atomic write operations used across
 * commands.
 *
 * @module
 */

import { join, dirname, basename, relative } from "node:path";
import { readdir, stat, writeFile, rename, unlink, mkdir } from "node:fs/promises";

/**
 * Write a JSON value to a file atomically using temp-file-then-rename.
 *
 * Creates a `.tmp` sibling in the same directory as the target, writes the
 * serialized content there, then renames over the target. On POSIX systems
 * `rename(2)` is atomic — the target is either the old content or the new
 * content, never a partial write. Same-directory placement avoids `EXDEV`
 * failures when `$TMPDIR` is on a different filesystem.
 *
 * @param targetPath - Absolute path to the JSON file
 * @param data - Value to serialize (pretty-printed with 2-space indent + trailing newline)
 */
export async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `.${basename(targetPath)}.tmp`);

  try {
    await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    await rename(tmpPath, targetPath);
  } catch (err) {
    // Clean up temp file if it was created before the failure
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
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
