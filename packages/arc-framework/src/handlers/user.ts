/**
 * Handlers for `arc user` subcommands: add, save, load, push, pull.
 *
 * @module
 */

import * as p from "@clack/prompts";

import {
  runUserSave, runUserLoad, runUserAdd, runUserPush, runUserFetch, runUserPull,
  buildSaveSummary, buildLoadSummary,
  hasLocalNotes,
} from "../commands/user.js";
import { slugifyIdentity } from "../lib/git/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { getInternalTemplatePath } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import { pushWithInteractiveRecovery } from "./push-recovery.js";
import {
  runWithSpinner, isHandledError, resolveUserIdentity, isRemoteError, readPmMode,
} from "./shared.js";

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

export async function handleUserLoad(): Promise<void> {
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

  let result;
  try {
    result = await runUserLoad({
      cwd: process.cwd(),
      io,
      identity,
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
    p.log.warn("No saved user directory found on HEAD or recent ancestors.");
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

  const result = await pushWithInteractiveRecovery(io, identity);
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
  if (hasLocal) {
    const proceed = await p.confirm({
      message: "Local notes exist and will be overwritten by remote. Continue?",
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

  if (hasLocal) {
    const proceed = await p.confirm({
      message: "Local notes exist and will be overwritten by remote. Continue?",
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Pull cancelled.");
      return;
    }
  }

  const spinner = p.spinner();
  spinner.start("Pulling user notes...");

  let result;
  try {
    result = await runUserPull({
      cwd: process.cwd(),
      io,
      identity,
      force: hasLocal,
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
    p.log.warn("No saved user directory found on HEAD or recent ancestors.");
    process.exitCode = 1;
    return;
  }

  spinner.stop("Pull complete.");
  p.note(buildLoadSummary(result), "Loaded");
  p.outro("Done.");
}
