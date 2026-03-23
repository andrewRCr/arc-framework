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
      const relPath = relative(dir, fullPath);
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
