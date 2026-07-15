/** Executable-mode policy for framework installation and update. */

import { join } from "node:path";

const EXECUTABLE_GITHOOKS = new Set([
  "system/.internal/githooks/commit-msg",
  "system/.internal/githooks/pre-commit",
  "system/.internal/githooks/pre-push",
]);

/** Filesystem boundary used to apply one installed mode. */
export type InstallChmod = (path: string, mode: number) => Promise<void>;

/**
 * Whether an ARC-relative path is installed as an executable.
 *
 * @param relativePath - Path relative to the installed `.arc` directory
 * @returns Whether installation owns its executable mode
 */
export function isExecutableInstallPath(relativePath: string): boolean {
  return EXECUTABLE_GITHOOKS.has(relativePath) || relativePath.endsWith(".sh");
}

/**
 * Apply installed executable modes without changing tracked source modes.
 *
 * @param arcDir - Absolute installed `.arc` directory
 * @param relativePaths - Installed paths to inspect
 * @param chmod - Injected filesystem mode writer
 * @returns Resolves after every executable path has mode `755`
 */
export async function applyExecutableInstallPermissions(
  arcDir: string,
  relativePaths: Iterable<string>,
  chmod: InstallChmod,
): Promise<void> {
  for (const relativePath of relativePaths) {
    if (isExecutableInstallPath(relativePath)) {
      await chmod(join(arcDir, relativePath), 0o755);
    }
  }
}
