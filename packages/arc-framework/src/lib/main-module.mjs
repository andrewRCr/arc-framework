/** Shared main-module recognition for native source scripts and scripts reached through filesystem links. */
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Use the caller's runtime main signal when available, otherwise compare physical entry and module paths.
 * In the fallback, a missing or unresolvable entry is not this module. Bundled callers keep their filename guards,
 * since a bundler rewrites every module's import metadata to the bundle's identity.
 * @param {{ url: string, main: boolean | undefined }} meta
 * @param {string | undefined} entryPath
 * @returns {Promise<boolean>}
 */
export async function isMainModule(meta, entryPath) {
  if (meta.main !== undefined) return meta.main;
  if (entryPath === undefined) return false;
  const entry = await realpath(entryPath).catch(() => null);
  return entry !== null && entry === await realpath(fileURLToPath(meta.url));
}
