/**
 * Per-WU user workspace lifecycle (close): remove `user/{identity}/{wuName}/`
 * recursively. Paired with `runUserOpen` from `./open.ts` for the lifecycle
 * contract codified in R65c.
 *
 * @module
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";

import type { UserCloseOptions } from "./types.js";

/**
 * Close a per-WU user workspace by removing `user/{identity}/{wuName}/`
 * recursively. Filesystem-only — the user-directory tree is gitignored, so
 * no git operations are involved. Idempotent: an already-absent subdir
 * no-ops cleanly via `rm`'s `force: true`, so re-invocation never errors.
 */
export async function runUserClose(options: UserCloseOptions): Promise<void> {
  const { cwd, identity, wuName } = options;
  const wuDir = join(cwd, ".arc", "user", identity, wuName);
  await rm(wuDir, { recursive: true, force: true });
}
