/**
 * Shared setup operations for `arc init` and `arc join`.
 *
 * Git integration (gitattributes, merge driver, hooks path) and post-init
 * user setup (identity, user directory, notes refspec). Extracted from
 * init.ts so both commands share the same setup sequence.
 */

import { join } from "node:path";
import { ensureDir, writeArcGitattributesBlock } from "./template/index.js";
import { configureNotesRefspec } from "./git/index.js";
import { detectHookManager } from "./hook-manager.js";
import { integrateHooks } from "./hook-integration.js";
import type { CoreIO } from "./types.js";
import { PM_MODE_ARC_IN_GIT } from "./constants.js";
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
 * Sets up the gitattributes merge strategy for WORK-STATUS.md, the custom
 * merge driver, and the hooks path. Both fresh init and join need this.
 *
 * @param options - Git integration options with injectable I/O
 */
export async function configureGitIntegration(
  options: GitIntegrationOptions,
): Promise<void> {
  const { cwd, exec, readFile, writeFile, access } = options;

  const gitattrsPath = join(cwd, ".gitattributes");
  await writeArcGitattributesBlock(
    gitattrsPath,
    [".arc/active/WORK-STATUS.md merge=ours"],
    readFile,
    writeFile,
  );
  await exec("git", ["config", "merge.ours.driver", "true"]);

  // Hook setup: integrate into existing hook manager if detected,
  // otherwise fall back to core.hooksPath (native git hooks).
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
  pmMode: string;
  identityResult: string | null;
}

/**
 * Run post-init user setup shared by both fresh and join modes.
 *
 * Stores identity in git config, creates the user directory with templates,
 * and configures git notes refspec for cross-machine portability.
 */
export async function runPostInitSetup(
  options: PostInitSetupOptions,
): Promise<void> {
  const { arcDir, internalTemplateDir, io, pmMode, identityResult } = options;

  if (identityResult) {
    await io.exec("git", ["config", "--local", "arc.identity", identityResult]);

    const userDir = join(arcDir, "user", identityResult);
    await ensureDir(userDir, io.mkdir);

    const sessionNotes = await io.readFile(
      join(internalTemplateDir, "user", "SESSION-NOTES.md"),
    );
    await io.writeFile(join(userDir, "SESSION-NOTES.md"), sessionNotes);

    if (pmMode === PM_MODE_ARC_IN_GIT) {
      const atomicInbox = await io.readFile(
        join(internalTemplateDir, "user", "ATOMIC-INBOX.md"),
      );
      await io.writeFile(join(userDir, "ATOMIC-INBOX.md"), atomicInbox);
    }
  }

  await configureNotesRefspec(io.exec);
}
