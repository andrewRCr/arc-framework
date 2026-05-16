/**
 * Handler for the `arc user sync` command — direction-aware notes-only sync.
 *
 * Inspects remote notes, local notes, and the on-disk user directory to choose
 * the correct sync direction: push local state, pull remote state, or prompt
 * on conflict. The top-level `arc sync` orchestrator routes its notes-cell
 * dispatch through this handler.
 *
 * @module
 */

import { access } from "node:fs/promises";

import * as p from "@clack/prompts";

import {
  hasLocalNotes,
  inspectUserSyncState,
  runUserLoad,
  runUserSave,
  runUserPull,
  recordPartialPushMarker,
  buildSaveSummary,
  buildLoadSummary,
  formatWorktreeQualifierLine,
  UserSaveError,
  type UserSyncState,
} from "../commands/user.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { isRefusalCondition } from "../lib/git/index.js";
import { runWorktreeSyncStatus } from "../lib/git/worktree-sync.js";
import { createUserIOContext } from "../lib/io-context.js";
import { createSyncOutput } from "../lib/sync-output.js";
import { resolveNotesPushPolicy } from "../lib/config/resolved-settings.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  isHandledError, isNonInteractiveEnvironment, requireArcProjectRoot, resolveUserIdentity,
  resolveCurrentBranchName,
} from "./shared.js";

/** Uniform overwrite-confirm prompt copy shared with the user handlers. */
const OVERWRITE_CONFIRM_MESSAGE = "Local notes will be overwritten by remote. Continue?";

type SyncAction = "noop" | "push" | "pull" | "load" | "push-load" | "conflict";

export interface UserSyncOptions {
  yes?: boolean;
  maxWalk?: number;
}

type DirectionParams = {
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
  identity: string;
  yes: boolean;
  maxWalk?: number;
  restoreAfterPush?: boolean;
  recordPartialPushOnFailure?: boolean;
  /** Threaded into the pushability matrix for the notes-vs-worktree alignment probe. */
  worktreeBranch?: string;
};

function walkExhaustedMessage(walked: number): string {
  return `walked ${walked} ancestors without finding a note; `
    + "use --max-walk to search deeper or confirm remote state with arc user status";
}

export async function handleUserSync(opts: UserSyncOptions = {}): Promise<void> {
  p.intro("arc user sync");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext();
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const { settings } = await readConfigSettings(cwd);
  const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
  const [state, worktree, branch] = await Promise.all([
    inspectUserSyncState({ cwd, io, identity }),
    remoteSyncEnabled
      ? runWorktreeSyncStatus({ exec: io.exec, remoteSyncEnabled: true })
      : Promise.resolve(undefined),
    resolveCurrentBranchName(io.exec),
  ]);
  const worktreeBranch = branch ?? undefined;
  const worktreeQualifier = formatWorktreeQualifierLine({
    worktree,
    offline: false,
    remoteSyncEnabled,
  });
  if (worktreeQualifier) {
    p.log.info(worktreeQualifier);
  }
  const action = decideSyncAction(state);
  const yes = Boolean(opts.yes);
  const maxWalk = opts.maxWalk;

  switch (action) {
    case "noop":
      if (state.remoteStatus === "remote unavailable") {
        p.log.warn("Remote status unavailable. Working files match the local git note.");
      } else {
        p.log.info("Local git note and working files are already up to date.");
      }
      p.outro("Done.");
      return;
    case "push":
      p.log.info("→ Saving working-file changes and pushing the local git note to remote.");
      await handlePushDirection({
        cwd,
        io,
        identity,
        yes,
        maxWalk,
        recordPartialPushOnFailure: worktree?.state === "clean",
        worktreeBranch,
      });
      return;
    case "pull":
      p.log.info("→ Pulling the newer remote git note and restoring it to working files.");
      await handlePullDirection({ cwd, io, identity, yes, maxWalk });
      return;
    case "load":
      p.log.info("→ Restoring the local git note to working files.");
      await handleLoadDirection({ cwd, io, identity, yes, maxWalk });
      return;
    case "push-load":
      p.log.info("→ Pushing the newer local git note, then restoring it to working files.");
      await handlePushDirection({
        cwd,
        io,
        identity,
        yes,
        maxWalk,
        restoreAfterPush: true,
        recordPartialPushOnFailure: worktree?.state === "clean",
        worktreeBranch,
      });
      return;
    case "conflict":
      await handleConflict({ cwd, io, identity, yes, maxWalk, worktreeBranch });
      return;
  }
}

export function decideSyncAction(state: UserSyncState): SyncAction {
  switch (state.remoteStatus) {
    case "conflict":
      return "conflict";
    case "remote ahead":
      return state.diskStatus === "current" || state.diskStatus === "stale"
        ? "pull"
        : "conflict";
    case "local ahead":
      if (state.diskStatus === "current") return "push";
      if (state.diskStatus === "stale") return "push-load";
      if (state.diskStatus === "local unsaved") return "push";
      return "conflict";
    case "remote unavailable":
      if (state.diskStatus === "current") return "noop";
      if (state.diskStatus === "stale") return "load";
      if (state.diskStatus === "local unsaved") return "push";
      return "conflict";
    case "in sync":
      if (state.diskStatus === "current") return "noop";
      if (state.diskStatus === "stale") return "load";
      if (state.diskStatus === "local unsaved") return "push";
      return "conflict";
  }
}

async function handleConflict(params: DirectionParams): Promise<void> {
  if (isNonInteractiveEnvironment()) {
    await degradeConflictToSaveOnly(params);
    return;
  }

  p.log.warn("Local and remote git notes conflict (both moved since common ancestor).");
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
    p.log.info("→ Pushing the local git note to remote.");
    await handlePushDirection(confirmed);
    return;
  }

  p.log.info("→ Pulling the remote git note into local working files.");
  await handlePullDirection(confirmed);
}

async function degradeConflictToSaveOnly(params: DirectionParams): Promise<void> {
  const { cwd, io, identity } = params;
  p.log.warn("Local and remote git notes conflict (both moved since common ancestor).");
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
    "Local save preserved; push skipped. Re-run `arc user sync` in a terminal to resolve.",
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

  try {
    const result = await runUserPull({
      cwd,
      io,
      identity,
      force: true,
      maxAncestorWalk: maxWalk,
    });
    if (!result) {
      spinner.stop("No note found.");
      p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
      process.exitCode = 1;
      return;
    }

    if (result.kind === "walk-exhausted") {
      spinner.stop("Walk exhausted.");
      p.log.warn(walkExhaustedMessage(result.walked));
      process.exitCode = 1;
      return;
    }

    spinner.stop("Pull complete.");
    p.note(buildLoadSummary(result), "Pulled");
    p.outro("Done.");
  } catch (err) {
    spinner.stop("Pull failed.");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Failed to pull user notes: ${msg}`);
    process.exitCode = 1;
  }
}

async function handleLoadDirection(params: DirectionParams): Promise<void> {
  const { cwd, io, identity, maxWalk } = params;
  const spinner = p.spinner();
  spinner.start("Restoring git note to working files...");

  try {
    const result = await runUserLoad({
      cwd,
      io,
      identity,
      maxAncestorWalk: maxWalk,
    });
    if (!result) {
      spinner.stop("No note found.");
      p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
      process.exitCode = 1;
      return;
    }

    if (result.kind === "walk-exhausted") {
      spinner.stop("Walk exhausted.");
      p.log.warn(walkExhaustedMessage(result.walked));
      process.exitCode = 1;
      return;
    }

    spinner.stop("Load complete.");
    p.note(buildLoadSummary(result), "Loaded");
    p.outro("Done.");
  } catch (err) {
    spinner.stop("Load failed.");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Failed to restore user notes: ${msg}`);
    process.exitCode = 1;
  }
}

async function handlePushDirection(params: DirectionParams): Promise<void> {
  const { cwd, io, identity, restoreAfterPush } = params;
  const output = createSyncOutput(false);

  const resolved = await resolveNotesPushPolicy({
    exec: io.exec,
    readFile: io.readFile,
    cwd,
    warn: (message) => { output.log.warn(message); },
  });

  let policy = resolved.value;
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

  const pushResult = await pushWithInteractiveRecovery({
    io,
    identity,
    cwd,
    access,
    worktreeBranch: params.worktreeBranch,
    output,
  });
  switch (pushResult.kind) {
    case "ok":
    case "ok-recovered":
    case "noop":
      if (restoreAfterPush) {
        await handleLoadDirection(params);
        return;
      }
      p.outro("Done.");
      return;
    case "cancelled":
      p.log.info("Push cancelled. Run `arc user push` when ready.");
      return;
    case "no-remote":
      await recordPartialPushMarkerAfterFailedPush(params);
      p.log.error("No remote configured. Push requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      p.log.warn("User directory was saved locally — push manually with `arc user push`.");
      process.exitCode = 1;
      return;
    case "failed-nontty-conflict":
      await recordPartialPushMarkerAfterFailedPush(params);
      p.log.warn(
        "Push rejected — local and remote notes conflict (both moved since common ancestor), "
        + "and the environment is non-interactive.",
      );
      p.log.warn(
        "Local save preserved; push skipped. Re-run `arc user sync` in a terminal to resolve.",
      );
      process.exitCode = 1;
      return;
    case "blocked":
      for (const condition of pushResult.conditions.filter(isRefusalCondition)) {
        p.log.error(condition.guidance);
      }
      p.log.warn("Local save preserved; notes push blocked by pre-check. Resolve and re-run `arc user push`.");
      process.exitCode = 1;
      return;
    case "failed": {
      await recordPartialPushMarkerAfterFailedPush(params);
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

async function recordPartialPushMarkerAfterFailedPush(params: DirectionParams): Promise<void> {
  if (!params.recordPartialPushOnFailure) return;
  await recordPartialPushMarker(params.cwd, params.io, params.identity);
}
