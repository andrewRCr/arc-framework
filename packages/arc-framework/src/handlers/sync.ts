/**
 * Handler for the `arc sync` command.
 *
 * Sugar command: `arc sync` = save + push, `arc sync --load` = pull + load.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  runUserSave, runUserLoad, runUserPush, runUserPull,
  buildSaveSummary, buildLoadSummary,
  UserSaveError,
} from "../commands/user.js";
import { createUserIOContext } from "../lib/io-context.js";
import { resolveUserIdentity, isHandledError } from "./shared.js";

export interface SyncOptions {
  load?: boolean;
}

export async function handleSync(opts: SyncOptions): Promise<void> {
  p.intro("arc sync");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext();
  const cwd = process.cwd();

  if (opts.load) {
    // Pull + load (force — sync explicitly replaces local with remote)
    const spinner = p.spinner();
    spinner.start("Pulling user notes...");
    try {
      await runUserPull({ io, identity, force: true });
      spinner.stop("Pull complete.");
    } catch (err) {
      spinner.stop("Pull failed.");
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Failed to pull user notes: ${msg}`);
      process.exitCode = 1;
      return;
    }

    const loadSpinner = p.spinner();
    loadSpinner.start("Loading user directory...");
    try {
      const result = await runUserLoad({ cwd, io, identity });

      if (!result) {
        loadSpinner.stop("No note found.");
        p.log.warn("No saved user directory found on HEAD or recent ancestors.");
        process.exitCode = 1;
        return;
      }

      loadSpinner.stop("Load complete.");
      p.note(buildLoadSummary(result), "Loaded");
    } catch (err) {
      loadSpinner.stop("Load failed.");
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Failed to load user directory: ${msg}`);
      process.exitCode = 1;
      return;
    }
  } else {
    // Save + push
    const spinner = p.spinner();
    spinner.start("Saving user directory...");

    try {
      const result = await runUserSave({ cwd, io, identity });
      spinner.stop("Save complete.");

      if (result.warnings.length > 0) {
        p.note(buildSaveSummary(result), "Saved");
      }
    } catch (err) {
      spinner.stop("Save failed.");
      if (err instanceof UserSaveError) {
        p.log.error(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    const pushSpinner = p.spinner();
    pushSpinner.start("Pushing user notes...");
    try {
      await runUserPush({ io, identity });
      pushSpinner.stop("Push complete.");
    } catch (err) {
      pushSpinner.stop("Push failed.");
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Failed to push user notes: ${msg}`);
      p.log.warn("User directory was saved locally — push manually with 'arc user push'.");
      process.exitCode = 1;
      return;
    }
  }

  p.outro("Done.");
}
