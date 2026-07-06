/**
 * Shared setup operations for `arc init` and `arc join`.
 *
 * Git integration (hooks path) and post-init user setup (identity, user
 * directory). Extracted from init.ts so both commands share the same setup
 * sequence.
 */

import { ensureDir } from "./template/index.js";
import { detectHookManager } from "./hook-manager.js";
import { integrateHooks } from "./hook-integration.js";
import { join } from "node:path";
import type { CoreIO } from "./types.js";
import type { ReadFileFn, WriteFileFn } from "./template/index.js";
import type { AccessFn } from "./hook-manager.js";

/** Options for git integration setup. */
export interface GitIntegrationOptions {
  cwd: string;
  exec: CoreIO["exec"];
  readFile: ReadFileFn;
  writeFile: WriteFileFn;
  access: AccessFn;
}

/**
 * Configure git integration for an ARC project.
 *
 * Sets up the hooks path (integrating with an existing hook manager when
 * present, otherwise falling back to native git hooks). Both fresh init
 * and join need this.
 *
 * @param options - Git integration options with injectable I/O
 */
export async function configureGitIntegration(
  options: GitIntegrationOptions,
): Promise<void> {
  const { cwd, exec, readFile, writeFile, access } = options;

  const hookManager = await detectHookManager(cwd, access);
  if (hookManager) {
    await integrateHooks(hookManager, readFile, writeFile);
  } else {
    await exec("git", ["config", "core.hooksPath", ".arc/system/.internal/githooks"]);
  }
}

/**
 * Cross-WU per-user instance files seeded into `user/{identity}/` at user-directory
 * creation (`arc init` / `arc join` via {@link runPostInitSetup}, and `arc user add`).
 * SESSION-NOTES is intentionally excluded — it is per-WU and seeded lazily by
 * `arc user open` once a work unit is anchored. Every creation path must seed the same
 * set, so both loops read this single source.
 */
export const CROSS_WU_INSTANCE_FILES = [
  "WORKING-MEMORY.md",
  "USER-INBOX.md",
] as const;

/** Options for post-init user setup. */
export interface PostInitSetupOptions {
  arcDir: string;
  internalTemplateDir: string;
  io: CoreIO;
  identityResult: string | null;
}

/**
 * Run post-init user setup shared by both fresh and join modes.
 *
 * Stores identity in git config and creates the user directory with the
 * cross-WU instance files (WORKING-MEMORY, USER-INBOX) seeded from the
 * internal templates. SESSION-NOTES is per-WU and seeded lazily by
 * `arc user open` once a work unit is anchored — there is no anchored WU
 * at init time. Per-user files seed cross-PM-mode (R65b) — `pm.mode` no
 * longer gates user-directory seeding.
 */
export async function runPostInitSetup(
  options: PostInitSetupOptions,
): Promise<void> {
  const { arcDir, internalTemplateDir, io, identityResult } = options;

  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    for (const filename of CROSS_WU_INSTANCE_FILES) {
      const content = await io.readFile(join(internalTemplateDir, "user", filename));
      await io.writeFile(join(userDir, filename), content);
    }
  }
}
