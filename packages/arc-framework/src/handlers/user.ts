/**
 * Handlers for `arc user` subcommands: add, save, load, push, pull.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  runUserSave, runUserLoad, runUserAdd, runUserPush, runUserFetch, runUserPull,
  runUserSessionInitStatus, runUserStatus,
  buildSaveSummary, buildLoadSummary, buildUserSessionInitStatusSummary, buildUserStatusSummary,
  hasLocalNotes,
} from "../commands/user.js";
import { slugifyIdentity } from "../lib/git/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  runWithSpinner, isHandledError, isNonInteractiveEnvironment, resolveUserIdentity, isRemoteError,
  readPmMode, readSessionRemoteSyncEnabled,
} from "./shared.js";

/** Uniform overwrite-confirm prompt copy. */
const OVERWRITE_CONFIRM_MESSAGE = "Local notes will be overwritten by remote. Continue?";

/** Returns true when the overwrite confirm should be skipped (--yes or non-interactive). */
function shouldSkipOverwriteConfirm(yes: boolean | undefined): boolean {
  return Boolean(yes) || isNonInteractiveEnvironment();
}

/** Shape of a walk-exhausted observation captured via the onWalkExhausted callback. */
interface WalkExhaustedCapture {
  walked: number;
  maxWalk: number;
}

/** Build the canonical "walked N ancestors" diagnostic line. */
function walkExhaustedMessage(capture: WalkExhaustedCapture): string {
  return `walked ${capture.walked} ancestors without finding a note; `
    + "use --max-walk to search deeper or confirm remote state with arc user status";
}

// --- Add ---

export async function handleUserAdd(rawIdentity: string): Promise<void> {
  p.intro("arc user add");

  // Sanitize identity to prevent path traversal from raw CLI input
  const identity = slugifyIdentity(rawIdentity);
  if (!identity) {
    p.log.error("Invalid identity — must contain at least one alphanumeric character.");
    return;
  }
  if (identity !== rawIdentity) {
    p.log.info(`Identity normalized to: ${identity}`);
  }

  const cwd = process.cwd();
  const io = createUserIOContext();
  const pmMode = await readPmMode(cwd);

  try {
    await runWithSpinner(
      `Creating user directory for ${identity}...`,
      () => runUserAdd({ cwd, io, identity, internalTemplateDir: getInternalTemplatePath(), pmMode }),
      `User directory created for ${identity}.`,
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

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext();

  try {
    const result = await runWithSpinner(
      "Saving user directory...",
      () => runUserSave({ cwd: process.cwd(), io, identity }),
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
}

export async function handleUserLoad(opts: UserLoadOptions = {}): Promise<void> {
  p.intro("arc user load");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext();
  const spinner = p.spinner();
  spinner.start("Loading user directory...");

  const walkState: { capture: WalkExhaustedCapture | null } = { capture: null };
  let result;
  try {
    result = await runUserLoad({
      cwd: process.cwd(),
      io,
      identity,
      maxAncestorWalk: opts.maxWalk,
      onWalkExhausted: (walked, maxWalk) => { walkState.capture = { walked, maxWalk }; },
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
    if (walkState.capture) {
      // Walk-exhausted is distinct from plain "no note" — we can't confirm
      // whether a note exists deeper than the cap. Exit 1 signals the
      // ambiguity; user can retry with --max-walk.
      spinner.stop("Walk exhausted.");
      p.log.warn(walkExhaustedMessage(walkState.capture));
      process.exitCode = 1;
      return;
    }
    spinner.stop("No note found.");
    p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
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

export async function handleUserPush(opts: UserPushOptions): Promise<void> {
  p.intro("arc user push");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext();

  // Explicit --force: bypass recovery prompt, push forcibly.
  if (opts.force) {
    try {
      await runWithSpinner(
        "Force-pushing user notes...",
        () => runUserPush({ io, identity, force: true }),
        "Force push complete.",
      );
      p.outro("Done.");
    } catch (err) {
      if (isHandledError(err)) return;
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

  const result = await pushWithInteractiveRecovery(io, identity, process.cwd());
  switch (result.kind) {
    case "ok":
    case "ok-recovered":
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
    case "failed":
      if (isHandledError(result.error)) return;
      throw result.error;
  }
}

// --- Fetch ---

export interface UserFetchOptions {
  identity?: string;
  yes?: boolean;
}

export async function handleUserFetch(opts: UserFetchOptions): Promise<void> {
  p.intro("arc user fetch");

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

  // Check once — reused for the prompt and the force flag
  const hasLocal = await hasLocalNotes(io, identity);

  // Warn if local notes exist that would be overwritten
  if (hasLocal && !shouldSkipOverwriteConfirm(opts.yes)) {
    const proceed = await p.confirm({
      message: OVERWRITE_CONFIRM_MESSAGE,
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Fetch cancelled.");
      return;
    }
  }
  try {
    await runWithSpinner(
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
}

export async function handleUserPull(opts: UserPullOptions): Promise<void> {
  p.intro("arc user pull");

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

  const spinner = p.spinner();
  spinner.start("Pulling user notes...");

  const walkState: { capture: WalkExhaustedCapture | null } = { capture: null };
  let result;
  try {
    result = await runUserPull({
      cwd: process.cwd(),
      io,
      identity,
      force: hasLocal,
      maxAncestorWalk: opts.maxWalk,
      onWalkExhausted: (walked, maxWalk) => { walkState.capture = { walked, maxWalk }; },
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
    if (walkState.capture) {
      spinner.stop("Walk exhausted.");
      p.log.warn(walkExhaustedMessage(walkState.capture));
      process.exitCode = 1;
      return;
    }
    spinner.stop("No note found.");
    p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
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
}

export async function handleUserStatus(opts: UserStatusOptions): Promise<void> {
  p.intro("arc user status");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext();
  const cwd = process.cwd();

  if (opts.sessionInit) {
    const remoteSyncEnabled = await readSessionRemoteSyncEnabled(cwd);
    const result = await runUserSessionInitStatus({
      cwd,
      io,
      identity,
      remoteSyncEnabled,
    });
    p.note(buildUserSessionInitStatusSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runUserStatus({
    cwd,
    io,
    identity,
    offline: opts.offline,
    all: opts.all,
  });

  p.note(buildUserStatusSummary(result), "Status");
  p.outro("Done.");
}
