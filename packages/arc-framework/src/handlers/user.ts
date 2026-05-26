/**
 * Handlers for `arc user` subcommands: add, save, load, push, pull.
 *
 * @module
 */

import { access } from "node:fs/promises";

import * as p from "@clack/prompts";

import {
  findStaleUserWuSubdirs, listUserWuSubdirContents, removeStaleUserWuSubdir,
  runUserClose, runUserOpen,
  runUserSave, runUserLoad, runUserAdd, runUserPush, runUserFetch, runUserPull,
  runUserSessionInitStatus, runUserStatus,
  buildSaveSummary, buildLoadSummary, buildUserSessionInitStatusSummary, buildUserStatusSummary,
  hasLocalNotes,
  UserPushBlockedError,
  type UserIOContext,
} from "../commands/user.js";
import { isRefusalCondition, slugifyIdentity } from "../lib/git/index.js";
import { resolveCurrentWuName } from "../lib/user-sync/index.js";
import { formatError, UserFacingError, type ArcErrorCode } from "../lib/errors.js";
import { getInternalTemplatePath, resolveArcRoot } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import { createSyncOutput, type SyncOutput } from "../lib/sync-output.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  runWithSpinner, isHandledError, isNonInteractiveEnvironment,
  requireArcProjectRoot, resolveUserIdentity, isRemoteError,
  resolveCurrentBranchName, ARC_PROJECT_ROOT_ERROR,
} from "./shared.js";

/** Uniform overwrite-confirm prompt copy. */
const OVERWRITE_CONFIRM_MESSAGE = "Local notes will be overwritten by remote. Continue?";

/** Returns true when the overwrite confirm should be skipped (--yes or non-interactive). */
function shouldSkipOverwriteConfirm(yes: boolean | undefined): boolean {
  return Boolean(yes) || isNonInteractiveEnvironment();
}

/** Build the canonical "walked N ancestors" diagnostic line. */
function walkExhaustedMessage(walked: number): string {
  return `walked ${walked} ancestors without finding a note; `
    + "use --max-walk to search deeper or confirm remote state with arc user status";
}

// --- Add ---

export async function handleUserAdd(rawIdentity: string): Promise<void> {
  p.intro("arc user add");
  const output = createSyncOutput(false);

  // Sanitize identity to prevent path traversal from raw CLI input
  const identity = slugifyIdentity(rawIdentity);
  if (!identity) {
    p.log.error("Invalid identity — must contain at least one alphanumeric character.");
    return;
  }
  if (identity !== rawIdentity) {
    p.log.info(`Identity normalized to: ${identity}`);
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const io = createUserIOContext();

  try {
    await runWithSpinner(
      output,
      `Creating user directory for ${identity}...`,
      () => runUserAdd({ cwd, io, identity, internalTemplateDir: getInternalTemplatePath() }),
      `User directory created for ${identity}.`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Open ---

/**
 * Open a per-WU user workspace subdir at `user/{identity}/{wuName}/`. Surfaces
 * stale subdirs from prior WUs via a defensive prompt before opening — `y`
 * removes and proceeds, `inspect` lists contents and re-prompts.
 */
export async function handleUserOpen(wuName: string): Promise<void> {
  p.intro("arc user open");
  const output = createSyncOutput(false);

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

  const staleSubdirs = await findStaleUserWuSubdirs({ cwd, io, identity, wuName });
  for (const stale of staleSubdirs) {
    const resolved = await promptStaleSubdir({ cwd, io, identity, stale });
    if (!resolved) {
      p.log.info("Open cancelled.");
      return;
    }
  }

  try {
    await runWithSpinner(
      output,
      `Opening user workspace for ${wuName}...`,
      () => runUserOpen({
        cwd, io, identity, wuName, internalTemplateDir: getInternalTemplatePath(),
      }),
      `User workspace opened at user/${identity}/${wuName}/.`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

async function promptStaleSubdir(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  stale: string;
}): Promise<boolean> {
  const { cwd, io, identity, stale } = options;
  // y removes and resolves the collision; inspect lists contents and re-prompts;
  // cancel (ctrl-C) returns false and aborts the open.
  for (;;) {
    const choice = await p.select({
      message: `Stale subdir user/${identity}/${stale}/ from prior WU. Remove?`,
      options: [
        { value: "y", label: "y — remove and proceed" },
        { value: "inspect", label: "inspect — list subdir contents" },
      ],
    });
    if (p.isCancel(choice)) return false;
    if (choice === "y") {
      await removeStaleUserWuSubdir({ cwd, identity, subdir: stale });
      return true;
    }
    const entries = await listUserWuSubdirContents({ cwd, io, identity, subdir: stale });
    if (entries.length === 0) {
      p.log.info(`(user/${identity}/${stale}/ is empty)`);
    } else {
      p.note(
        entries.map((e) => `  ${e.name} (${e.size} bytes)`).join("\n"),
        `Contents of user/${identity}/${stale}/`,
      );
    }
  }
}

// --- Close ---

/**
 * Close a per-WU user workspace subdir at `user/{identity}/{wuName}/`.
 * Recursive remove; idempotent on absent subdir.
 */
export async function handleUserClose(wuName: string): Promise<void> {
  p.intro("arc user close");
  const output = createSyncOutput(false);

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  try {
    await runWithSpinner(
      output,
      `Closing user workspace for ${wuName}...`,
      () => runUserClose({ cwd, identity, wuName }),
      `User workspace closed (user/${identity}/${wuName}/).`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Save ---

export async function handleUserSave(): Promise<void> {
  p.intro("arc user save");
  const output = createSyncOutput(false);

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

  try {
    const result = await runWithSpinner(
      output,
      "Saving user directory...",
      () => runUserSave({ cwd, io, identity }),
      "Save complete.",
    );
    p.note(buildSaveSummary(result), "Saved");

    if (result.warnings.length > 0) {
      p.log.warn("Some files were skipped (see details above).");
    }
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Load ---

export interface UserLoadOptions {
  yes?: boolean;
  maxWalk?: number;
  /** Override the auto-derived current WU name. Absent → derive from active-meta / branch. */
  currentWuName?: string;
}

export async function handleUserLoad(opts: UserLoadOptions = {}): Promise<void> {
  p.intro("arc user load");
  const output = createSyncOutput(false);

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
  const spinner = output.spinner();
  spinner.start("Loading user directory...");

  let result;
  try {
    const currentWuName = opts.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);
    result = await runUserLoad({
      cwd,
      io,
      identity,
      maxAncestorWalk: opts.maxWalk,
      currentWuName,
    });
  } catch (err) {
    spinner.stop("Load failed.");
    if (err instanceof UserFacingError) {
      p.log.error(formatError(err));
      return;
    }
    throw err;
  }

  if (!result) {
    spinner.stop("No note found.");
    p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
    return;
  }

  if (result.kind === "walk-exhausted") {
    // Walk-exhausted is distinct from plain "no note" — we can't confirm
    // whether a note exists deeper than the cap. Exit 1 signals the
    // ambiguity; user can retry with --max-walk.
    spinner.stop("Walk exhausted.");
    p.log.warn(walkExhaustedMessage(result.walked));
    process.exitCode = 1;
    return;
  }

  spinner.stop("Load complete.");
  p.note(buildLoadSummary(result), "Loaded");

  p.outro("Done.");
}

// --- Push ---

export interface UserPushOptions {
  force?: boolean;
}

/**
 * Handle `arc user push`.
 *
 * Default path runs through `pushWithInteractiveRecovery`, which gates on the
 * pushability pre-check, surfaces no-op detection, and routes divergent
 * pushes through the `[rejected]` recovery branch. Block-disposition
 * conditions (rebase in progress, detached HEAD) refuse the push; advisory
 * `force-push-required` is not refused at this site — divergence is handled
 * in recovery (see `commands/user/push-fetch.ts` for the single-leg / paired
 * asymmetry).
 *
 * **`--force` escape hatch.** Explicit user opt-in bypasses both the
 * pushability pre-check (block-disposition conditions still throw via
 * `UserPushBlockedError`) and the recovery branch entirely, executing
 * `git push --force` against the notes ref. By-design unguarded — matches
 * `git push --force` semantics. Automatic pushes never reach this branch:
 * `arc sync`, the handoff cascade, and any other internal caller leaves
 * `force` unset, so the I7 advisory-refusal contract still covers every
 * non-explicit push.
 */
export async function handleUserPush(opts: UserPushOptions): Promise<void> {
  p.intro("arc user push");
  const output = createSyncOutput(false);

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

  const worktreeBranch = await resolveCurrentBranchName(io.exec) ?? undefined;

  // Explicit --force: bypass recovery prompt, push forcibly.
  if (opts.force) {
    try {
      await runWithSpinner(
        output,
        "Force-pushing user notes...",
        () => runUserPush({ cwd, io, identity, force: true, access, worktreeBranch }),
        "Force push complete.",
      );
      p.outro("Done.");
    } catch (err) {
      if (isHandledError(err)) return;
      if (err instanceof UserPushBlockedError) {
        p.log.error(err.message);
        process.exitCode = 1;
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (isRemoteError(msg)) {
        p.log.error("No remote configured. Push requires a remote repository.");
        p.log.info("Set up a remote with: git remote add origin <url>");
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    return;
  }

  const result = await pushWithInteractiveRecovery({
    io, identity, cwd, access, worktreeBranch, output,
  });
  switch (result.kind) {
    case "ok":
    case "ok-recovered":
    case "noop":
      p.outro("Done.");
      return;
    case "cancelled":
      p.log.info("Push cancelled.");
      return;
    case "no-remote":
      p.log.error("No remote configured. Push requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      process.exitCode = 1;
      return;
    case "failed-nontty-conflict":
      p.log.warn(
        "Push rejected — local and remote notes conflict (both moved since common ancestor), "
        + "and the environment is non-interactive.",
      );
      p.log.warn(
        "Local save preserved; push skipped. Re-run `arc user push` in a terminal to resolve.",
      );
      process.exitCode = 1;
      return;
    case "blocked":
      for (const condition of result.conditions.filter(isRefusalCondition)) {
        p.log.error(condition.guidance);
      }
      process.exitCode = 1;
      return;
    case "failed":
      if (isHandledError(result.error)) return;
      throw result.error;
  }
}

// --- Fetch ---

export interface UserFetchOptions {
  identity?: string;
}

export async function handleUserFetch(opts: UserFetchOptions): Promise<void> {
  p.intro("arc user fetch");
  const output = createSyncOutput(false);

  let identity: string;
  if (opts.identity) {
    identity = opts.identity;
    p.log.info(`Fetching notes for identity: ${identity}`);
  } else {
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
  }
  const io = createUserIOContext();

  // Force-fetch when a local note exists for this identity so the remote ref
  // overwrites it. Working files are untouched — pull is the operation that
  // restores files and prompts before overwriting.
  const hasLocal = await hasLocalNotes(io, identity);
  try {
    await runWithSpinner(
      output,
      "Fetching user notes...",
      () => runUserFetch({ io, identity, force: hasLocal }),
      "Fetch complete.",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Detect missing remote
    if (isRemoteError(msg)) {
      p.log.error("No remote configured. Fetch requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      process.exitCode = 1;
      return;
    }

    // Detect remote ref not found (no notes on remote for this identity)
    if (msg.includes("couldn't find remote ref")) {
      p.log.warn(`No notes found on remote for identity "${identity}".`);
      p.log.info("The identity may not have pushed notes, or the name may be incorrect.");
      process.exitCode = 1;
      return;
    }

    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Pull ---

export interface UserPullOptions {
  identity?: string;
  yes?: boolean;
  maxWalk?: number;
  /** Override the auto-derived current WU name. Absent → derive from active-meta / branch. */
  currentWuName?: string;
}

export async function handleUserPull(opts: UserPullOptions): Promise<void> {
  p.intro("arc user pull");
  const output = createSyncOutput(false);

  let identity: string;
  if (opts.identity) {
    identity = opts.identity;
    p.log.info(`Pulling notes for identity: ${identity}`);
  } else {
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
  }

  const io = createUserIOContext();
  const hasLocal = await hasLocalNotes(io, identity);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (hasLocal && !shouldSkipOverwriteConfirm(opts.yes)) {
    const proceed = await p.confirm({
      message: OVERWRITE_CONFIRM_MESSAGE,
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Pull cancelled.");
      return;
    }
  }

  const spinner = output.spinner();
  spinner.start("Pulling user notes...");

  let result;
  try {
    const currentWuName = opts.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);
    result = await runUserPull({
      cwd,
      io,
      identity,
      force: hasLocal,
      maxAncestorWalk: opts.maxWalk,
      currentWuName,
    });
  } catch (err) {
    spinner.stop("Pull failed.");
    const msg = err instanceof Error ? err.message : String(err);

    if (isRemoteError(msg)) {
      p.log.error("No remote configured. Pull requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      process.exitCode = 1;
      return;
    }

    if (msg.includes("couldn't find remote ref")) {
      p.log.warn(`No notes found on remote for identity "${identity}".`);
      p.log.info("The identity may not have pushed notes, or the name may be incorrect.");
      process.exitCode = 1;
      return;
    }

    if (err instanceof UserFacingError) {
      p.log.error(formatError(err));
      return;
    }
    throw err;
  }

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
}

// --- Status ---

export interface UserStatusOptions {
  offline?: boolean;
  all?: boolean;
  sessionInit?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export async function handleUserStatus(opts: UserStatusOptions): Promise<void> {
  const json = Boolean(opts.json);
  const output = createSyncOutput(json);
  output.intro("arc user status");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (err instanceof UserFacingError) {
      emitStatusError(json, output, err.code, err.message, err);
      process.exitCode = 1;
      return;
    }
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext();
  const cwd = json ? resolveArcRoot(process.cwd()) : requireArcProjectRoot();
  if (!cwd) {
    if (json) {
      emitStatusError(json, output, "NOT_IN_ARC_PROJECT", ARC_PROJECT_ROOT_ERROR);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.sessionInit) {
    const { settings } = await readConfigSettings(cwd);
    const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
    const result = await runUserSessionInitStatus({
      cwd,
      io,
      identity,
      remoteSyncEnabled,
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    output.note(buildUserSessionInitStatusSummary(result), "Session Init");
    output.outro("Done.");
    return;
  }

  const { settings } = await readConfigSettings(cwd);
  const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
  const result = await runUserStatus({
    cwd,
    io,
    identity,
    offline: opts.offline,
    all: opts.all,
    remoteSyncEnabled,
    verbose: Boolean(opts.verbose),
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  output.note(buildUserStatusSummary(result), "Status");
  output.outro("Done.");
}

/**
 * Surface a status-handler error in the format appropriate for the active
 * mode. Under `--json`, writes a single envelope `{ error: { code, message } }`
 * to stdout — keeps the JSON pipe contract intact (every return path emits an
 * envelope) and avoids contaminating stdout with clack output. In human mode,
 * routes the formatted error through the SyncOutput log sink.
 */
function emitStatusError(
  json: boolean,
  output: SyncOutput,
  code: ArcErrorCode,
  message: string,
  formatSource?: Error,
): void {
  if (json) {
    const envelope = { error: { code, message } };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  output.log.error(formatSource ? formatError(formatSource) : message);
}
