/**
 * Handler for the `arc sync` command.
 *
 * Performs session-handoff sync according to the resolved `user.sync_push`
 * policy (`always` / `prompt` / `manual`). `arc sync --load` pulls and loads
 * the user directory from git notes.
 *
 * Policy resolution: `git config arc.syncPush` → yaml `user.sync_push` →
 * default (`always`). See `lib/sync-policy.ts`.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  runUserSave, runUserLoad, runUserPull,
  buildSaveSummary, buildLoadSummary,
  UserSaveError,
} from "../commands/user.js";
import { createUserIOContext } from "../lib/io-context.js";
import { resolveSyncPushPolicy } from "../lib/sync-policy.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  isHandledError, isNonInteractiveEnvironment, resolveUserIdentity,
} from "./shared.js";

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

    p.outro("Done.");
    return;
  }

  // --- Save + push, dispatched by resolved policy ---

  const resolved = await resolveSyncPushPolicy({
    exec: io.exec,
    readFile: io.readFile,
    cwd,
    warn: (m) => { p.log.warn(m); },
  });

  let policy = resolved.policy;
  if (policy === "prompt" && isNonInteractiveEnvironment()) {
    p.log.warn(
      'Non-interactive environment detected — degrading "prompt" policy to "manual" (save only).',
    );
    policy = "manual";
  }

  // Save (runs regardless of policy)
  const saveSpinner = p.spinner();
  saveSpinner.start("Saving user directory...");
  try {
    const result = await runUserSave({ cwd, io, identity });
    saveSpinner.stop("Save complete.");
    if (result.warnings.length > 0) {
      p.note(buildSaveSummary(result), "Saved");
    }
  } catch (err) {
    saveSpinner.stop("Save failed.");
    if (err instanceof UserSaveError) {
      p.log.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  // Push dispatch
  if (policy === "manual") {
    p.log.info("Push skipped (policy: manual). Run `arc user push` when ready.");
    p.outro("Done.");
    return;
  }

  if (policy === "prompt") {
    const shouldPush = await p.confirm({
      message: "Push user notes to remote now?",
      initialValue: true,
    });
    if (p.isCancel(shouldPush) || !shouldPush) {
      p.log.info("Push skipped. Run `arc user push` when ready.");
      p.outro("Done.");
      return;
    }
  }

  const pushResult = await pushWithInteractiveRecovery(io, identity);
  switch (pushResult.kind) {
    case "ok":
    case "ok-recovered":
      p.outro("Done.");
      return;
    case "cancelled":
      p.log.info("Push cancelled. Run `arc user push` when ready.");
      return;
    case "no-remote":
      p.log.error("No remote configured. Push requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      p.log.warn("User directory was saved locally — push manually with `arc user push`.");
      process.exitCode = 1;
      return;
    case "failed": {
      if (!isHandledError(pushResult.error)) {
        const msg = pushResult.error instanceof Error
          ? pushResult.error.message
          : String(pushResult.error);
        p.log.error(`Failed to push user notes: ${msg}`);
      }
      p.log.warn("User directory was saved locally — push manually with `arc user push`.");
      process.exitCode = 1;
      return;
    }
  }
}
