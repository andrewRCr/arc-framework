/**
 * Package version resolution.
 *
 * Reads the framework version from the CLI package's own `package.json`
 * at runtime, using the same walk-up pattern as `paths.ts`.
 *
 * @module
 */

import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const FALLBACK_VERSION = "0.0.0";

/**
 * Returns the framework version from the CLI package's `package.json`.
 *
 * Walks up from the compiled source file to find the nearest `package.json`
 * and reads its `version` field. Falls back to `"0.0.0"` if resolution fails.
 *
 * @returns Semver version string
 */
export function getFrameworkVersion(): string {
  return findVersionFromDir(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Finds the `version` field from the nearest ancestor `package.json`
 * starting from `startDir`.
 *
 * Exposed for testing — production code should use {@link getFrameworkVersion}.
 *
 * @param startDir - Directory to start searching from
 * @returns Semver version string, or `"0.0.0"` if no package.json is found
 */
export function findVersionFromDir(startDir: string): string {
  let dir = startDir;
  while (true) {
    const candidate = resolve(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, "utf8");
        const pkg = JSON.parse(raw) as { version?: string };
        if (typeof pkg.version === "string") return pkg.version;
      } catch {
        // Malformed JSON — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return FALLBACK_VERSION;
}
