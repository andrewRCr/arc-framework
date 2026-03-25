/**
 * Package version resolution and registry checking.
 *
 * Reads the framework version from the CLI package's own `package.json`
 * at runtime, and optionally checks the npm registry for the latest
 * published version.
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
  for (;;) {
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

// --- npm Registry Checking ---

/** Minimal fetch response shape for dependency injection. */
export interface FetchResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

/** Injectable fetch function for testability. */
export type FetchFn = (url: string) => Promise<FetchResponse>;

const NPM_REGISTRY = "https://registry.npmjs.org";

/**
 * Check the npm registry for the latest published version of a package.
 *
 * Uses native `fetch()` (Node 18+). Network errors are non-fatal — returns
 * null so callers can gracefully skip the version display when offline.
 *
 * @param packageName - npm package name (supports scoped packages)
 * @param fetchImpl - Injectable fetch function (defaults to global `fetch`)
 * @returns Latest version string, or null if the registry is unreachable
 */
export async function checkLatestVersion(
  packageName: string,
  // Double cast: FetchFn defines a minimal response interface for DI/testability
  // that doesn't structurally match globalThis.fetch's full Response type.
  fetchImpl: FetchFn = fetch as unknown as FetchFn,
): Promise<string | null> {
  // Encode scoped package names: @scope/name → @scope%2Fname
  const parts = packageName.split("/");
  const encoded = parts.length === 2
    ? `${parts[0]}%2F${encodeURIComponent(parts[1] ?? "")}`
    : encodeURIComponent(packageName);
  const url = `${NPM_REGISTRY}/${encoded}/latest`;

  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const pkg = await response.json() as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}
