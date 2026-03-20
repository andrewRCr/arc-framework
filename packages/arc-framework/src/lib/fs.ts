/**
 * Shared filesystem utilities for the ARC CLI.
 *
 * Directory traversal and file listing functions used across commands.
 */

import { join, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";

/**
 * Recursively list files under a directory, returning paths relative to it.
 *
 * Skips the `.pristine/` directory (internal baseline, not user-facing) and
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
      const relPath = relative(dir, fullPath);
      // Skip .pristine directory
      if (relPath === ".pristine" || relPath.startsWith(".pristine/")) continue;
      // Skip user/{identity}/ directories (gitignored personal workspace)
      if (/^user\/[^/]+\//.test(relPath)) continue;
      const s = await stat(fullPath);
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
