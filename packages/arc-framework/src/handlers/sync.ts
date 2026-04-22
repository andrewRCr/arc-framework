/**
 * Handler for the `arc sync` command.
 *
 * Inspects remote notes, local notes, and the on-disk user directory to choose
 * the correct sync direction: push local state, pull remote state, or prompt
 * when refs have diverged.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  hasLocalNotes,
  inspectUserSyncState,
  runUserSave,
  runUserPull,
  buildSaveSummary,
  buildLoadSummary,
  UserSaveError,
  type UserSyncState,
} from "../commands/user.js";
import { createUserIOContext } from "../lib/io-context.js";
import { resolveSyncPushPolicy } from "../lib/sync-policy.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  isHandledError, isNonInteractiveEnvironment, resolveUserIdentity,
} from "./shared.js";

/** Uniform overwrite-confirm prompt copy shared with the user handlers. */
const OVERWRITE_CONFIRM_MESSAGE = "Local notes will be overwritten by remote. Continue?";

type SyncAction = "noop" | "push" | "pull" | "conflict";

export interface SyncOptions {
  yes?: boolean;
  maxWalk?: number;
}

type DirectionParams = {
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
  identity: string;
  yes: boolean;
  maxWalk?: number;
};

function walkExhaustedMessage(walked: number): string {
  return `walked ${walked} ancestors without finding a note; `
    + "use --max-walk to search deeper or confirm remote state with arc user status";
}

export async function handleSync(opts: SyncOptions = {}): Promise<void> {
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
  const state = await inspectUserSyncState({ cwd, io, identity });
  const action = decideSyncAction(state);
  const yes = Boolean(opts.yes);
  const maxWalk = opts.maxWalk;

  switch (action) {
    case "noop":
      if (state.refState === "remote-unavailable") {
        p.log.warn("Remote status unavailable. Local user directory matches the saved snapshot.");
      } else {
        p.log.info("User directory already in sync.");
      }
      p.outro("Done.");
      return;
    case "push":
      p.log.info("→ Pushing local user directory to remote notes.");
      await handlePushDirection({ cwd, io, identity, yes, maxWalk });
      return;
    case "pull":
      p.log.info("→ Pulling remote notes into the local user directory.");
      await handlePullDirection({ cwd, io, identity, yes, maxWalk });
      return;
    case "conflict":
      await handleConflict({ cwd, io, identity, yes, maxWalk });
      return;
  }
}

export function decideSyncAction(state: UserSyncState): SyncAction {
  switch (state.refState) {
    case "remote-unavailable":
      return state.diskState === "different" ? "push" : "noop";
    case "diverged":
      return "conflict";
    case "local-ahead":
      return "push";
    case "remote-ahead":
      return state.diskState === "same" ? "pull" : "conflict";
    case "same":
      return state.diskState === "same" ? "noop" : "push";
  }
}

async function handleConflict(params: DirectionParams): Promise<void> {
  if (isNonInteractiveEnvironment()) {
    await degradeConflictToSaveOnly(params);
    return;
  }

  p.log.warn("Local and remote notes have diverged.");
  const action = await p.select({
    message: "How would you like to resolve sync?",
    options: [
      { value: "push", label: "Push local state to remote" },
      { value: "pull", label: "Pull remote state to local disk" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") {
    p.log.info("Sync cancelled.");
    return;
  }

  // User explicitly chose the direction via the conflict select — skip the
  // redundant overwrite confirm in the downstream handler.
  const confirmed: DirectionParams = { ...params, yes: true };

  if (action === "push") {
    p.log.info("→ Pushing local user directory to remote notes.");
    await handlePushDirection(confirmed);
    return;
  }

  p.log.info("→ Pulling remote notes into the local user directory.");
  await handlePullDirection(confirmed);
}

async function degradeConflictToSaveOnly(params: DirectionParams): Promise<void> {
  const { cwd, io, identity } = params;
  p.log.warn("Local and remote notes conflict (both moved since common ancestor).");
  p.log.warn("Non-interactive environment detected — degrading to save-only.");

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

  p.log.warn(
    "Local save preserved; push skipped. Re-run `arc sync` in a terminal to resolve.",
  );
  p.outro("Done.");
}

async function handlePullDirection(params: DirectionParams): Promise<void> {
  const { cwd, io, identity, yes, maxWalk } = params;

  const hasLocal = await hasLocalNotes(io, identity);
  if (hasLocal && !yes && !isNonInteractiveEnvironment()) {
    const proceed = await p.confirm({
      message: OVERWRITE_CONFIRM_MESSAGE,
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Pull cancelled.");
      return;
    }
  }

  const spinner = p.spinner();
  spinner.start("Pulling user notes...");

  const walkState: { walked: number | null } = { walked: null };
  try {
    const result = await runUserPull({
      cwd,
      io,
      identity,
      force: true,
      maxAncestorWalk: maxWalk,
      onWalkExhausted: (walked) => { walkState.walked = walked; },
    });
    if (!result) {
      if (walkState.walked !== null) {
        spinner.stop("Walk exhausted.");
        p.log.warn(walkExhaustedMessage(walkState.walked));
        process.exitCode = 1;
        return;
      }
      spinner.stop("No note found.");
      p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
      process.exitCode = 1;
      return;
    }

    spinner.stop("Pull complete.");
    p.note(buildLoadSummary(result), "Loaded");
    p.outro("Done.");
  } catch (err) {
    spinner.stop("Pull failed.");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Failed to pull user notes: ${msg}`);
    process.exitCode = 1;
  }
}

async function handlePushDirection(params: DirectionParams): Promise<void> {
  const { cwd, io, identity } = params;

  const resolved = await resolveSyncPushPolicy({
    exec: io.exec,
    readFile: io.readFile,
    cwd,
    warn: (message) => { p.log.warn(message); },
  });

  let policy = resolved.policy;
  if (policy === "prompt" && isNonInteractiveEnvironment()) {
    p.log.warn(
      'Non-interactive environment detected — degrading "prompt" policy to "manual" (save only).',
    );
    policy = "manual";
  }

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

  const pushResult = await pushWithInteractiveRecovery(io, identity, cwd);
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
    case "failed-nontty-conflict":
      p.log.warn(
        "Push rejected — local and remote notes conflict (both moved since common ancestor), "
        + "and the environment is non-interactive.",
      );
      p.log.warn(
        "Local save preserved; push skipped. Re-run `arc sync` in a terminal to resolve.",
      );
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
