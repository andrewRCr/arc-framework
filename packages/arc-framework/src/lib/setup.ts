/**
 * Shared setup operations for `arc init` and `arc join`.
 *
 * Git integration (hooks path) and post-init user setup (identity, user
 * directory, notes refspec). Extracted from init.ts so both commands share
 * the same setup sequence.
 */

import { ensureDir } from "./template/index.js";
import { configureNotesRefspec } from "./git/index.js";
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
    await exec("git", ["config", "core.hooksPath", ".arc/system/githooks"]);
  }
}

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
 * Stores identity in git config, creates the user directory with the per-user
 * instance files (SESSION-NOTES, WORKING-MEMORY, USER-INBOX) seeded from the
 * internal templates, and configures the git notes refspec for cross-machine
 * portability. Per-user files seed cross-PM-mode (R65b) — `pm.mode` no longer
 * gates user-directory seeding.
 */
export async function runPostInitSetup(
  options: PostInitSetupOptions,
): Promise<void> {
  const { arcDir, internalTemplateDir, io, identityResult } = options;

  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    for (const filename of ["SESSION-NOTES.md", "WORKING-MEMORY.md", "USER-INBOX.md"]) {
      const content = await io.readFile(join(internalTemplateDir, "user", filename));
      await io.writeFile(join(userDir, filename), content);
    }
  }

  await configureNotesRefspec(io.exec);
}
