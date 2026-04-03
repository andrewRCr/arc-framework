/**
 * Hook manager detection for ARC CLI.
 *
 * Detects whether a project uses an external git hook manager (husky,
 * lefthook, or pre-commit). When detected, ARC integrates into the
 * manager's config instead of setting core.hooksPath directly.
 *
 * @module
 */

import { join } from "node:path";

/** Supported hook manager names. */
export type HookManager = "husky" | "lefthook" | "pre-commit";

/** Detection result when a hook manager is found. */
export interface HookManagerResult {
  manager: HookManager;
  configPath: string;
}

/** File-existence check function (injectable for testing). */
export type AccessFn = (path: string) => Promise<void>;

/** Detection probes in priority order: husky > lefthook > pre-commit. */
const PROBES: ReadonlyArray<{ manager: HookManager; paths: string[] }> = [
  { manager: "husky", paths: [".husky"] },
  { manager: "lefthook", paths: ["lefthook.yml", "lefthook.yaml"] },
  { manager: "pre-commit", paths: [".pre-commit-config.yaml"] },
];

/**
 * Detect which hook manager (if any) a project uses.
 *
 * Checks for manager markers in priority order. Returns the first match,
 * or null if no manager is detected.
 *
 * @param cwd - Repository root directory
 * @param access - File existence check (defaults to fs.access)
 * @returns Detection result or null
 */
export async function detectHookManager(
  cwd: string,
  access: AccessFn,
): Promise<HookManagerResult | null> {
  for (const probe of PROBES) {
    for (const relPath of probe.paths) {
      const fullPath = join(cwd, relPath);
      try {
        await access(fullPath);
        return { manager: probe.manager, configPath: fullPath };
      } catch {
        // Path doesn't exist, try next
      }
    }
  }
  return null;
}
