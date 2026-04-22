/**
 * Shared utilities for CLI command handlers.
 *
 * Common patterns extracted from individual handlers: spinners, error
 * boundaries, identity resolution, environment detection, config reading.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveIdentity, isGitRepo } from "../lib/git/index.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import { UserSaveError } from "../commands/user.js";
import { parseArcConfig } from "../lib/config.js";
import {
  ARC_CONFIG_SEGMENTS,
  CONFIG_KEY_PM_MODE,
  CONFIG_KEY_SESSION_REMOTE_SYNC,
} from "../lib/constants.js";
import { gitExec } from "../lib/io-context.js";

// --- Spinner ---

/**
 * Run an async operation with a clack spinner. Stops the spinner on success
 * or failure and re-throws errors for the caller to handle.
 *
 * Verb-tense convention for user/sync CLI output:
 * - `label` (in-progress): present continuous — "Saving user directory...".
 * - `doneLabel` (success): completed adjective — "Save complete.".
 * - Failure label emitted here is "Failed."; callers that need a specific
 *   failure label (e.g., "Pull failed.") manage their own spinner inline.
 * - `p.note(..., "Label")` result-box labels: past tense matching the caller's
 *   outer verb, not the internal function called — "Pulled" for `arc sync pull`
 *   and `arc user pull` even though they consume `buildLoadSummary`; "Loaded"
 *   only for `arc user load`.
 */
export async function runWithSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  doneLabel: string,
): Promise<T> {
  const spinner = p.spinner();
  spinner.start(label);
  try {
    const result = await fn();
    spinner.stop(doneLabel);
    return result;
  } catch (err) {
    spinner.stop("Failed.");
    throw err;
  }
}

// --- Error Handling ---

/**
 * Check if an error is a known user-facing type and display it.
 * Returns true if the error was handled (caller should return),
 * false if it's an unknown error (caller should re-throw).
 */
export function isHandledError(err: unknown): boolean {
  if (err instanceof UserFacingError) {
    p.log.error(formatError(err));
    process.exitCode = 1;
    return true;
  }
  if (err instanceof UserSaveError) {
    p.log.error(err.message);
    return true;
  }
  return false;
}

/** Check whether a git error message indicates a missing remote. */
export function isRemoteError(msg: string): boolean {
  return msg.includes("Could not read from remote") || msg.includes("No such remote");
}

// --- Identity ---

/**
 * Resolve identity for user commands. Requires arc.identity to be set.
 * Throws UserFacingError if identity is not configured.
 */
export async function resolveUserIdentity(): Promise<string> {
  const identity = await resolveIdentity({ exec: gitExec });
  if (!identity) {
    throw new UserFacingError({
      code: "IDENTITY_MISSING",
      whatHappened: "No identity configured.",
      why: "User commands require arc.identity to be set in git config.",
      whatToDo: "Run 'arc init' first.",
    });
  }
  return identity;
}

/**
 * Resolve identity with optional interactive prompt (for init/join).
 * Returns null if identity cannot be resolved and no prompt is available.
 */
export async function resolveIdentityWithPrompt(interactive: boolean): Promise<string | null> {
  return resolveIdentity({
    exec: gitExec,
    prompt: interactive ? async (message: string, defaultValue?: string) => {
      const result = await p.text({
        message,
        defaultValue,
        placeholder: defaultValue,
      });
      return result;
    } : undefined,
  });
}

// --- Environment ---

/**
 * Detect non-interactive environment (CI or non-TTY stdin).
 * Returns true if `--yes` behavior should be implied.
 */
export function isNonInteractiveEnvironment(): boolean {
  return process.env.CI === "true" || !process.stdin.isTTY;
}

/**
 * Guard: require a git repository. Logs a user-facing error and sets exit
 * code if not in a git repo. Returns true if the guard passes.
 */
export async function requireGitRepo(): Promise<boolean> {
  if (await isGitRepo(gitExec)) return true;
  p.log.error(formatError(new UserFacingError({
    code: "GIT_MISSING",
    whatHappened: "Not inside a git repository",
    why: "ARC requires a git repository for version control and hooks.",
    whatToDo: "Run 'git init' first, then try again.",
  })));
  process.exitCode = 1;
  return false;
}

// --- Config ---

/** Read pm.mode from arc-config.yml, returning "none" on any error. */
export async function readPmMode(cwd: string): Promise<string> {
  try {
    const configContent = await readFile(join(cwd, ...ARC_CONFIG_SEGMENTS), "utf-8");
    const config = parseArcConfig(configContent);
    return config[CONFIG_KEY_PM_MODE] ?? "none";
  } catch {
    return "none";
  }
}

/** Read session.remote_sync from arc-config.yml, defaulting to enabled on any error. */
export async function readSessionRemoteSyncEnabled(cwd: string): Promise<boolean> {
  try {
    const configContent = await readFile(join(cwd, ...ARC_CONFIG_SEGMENTS), "utf-8");
    const config = parseArcConfig(configContent);
    return (config[CONFIG_KEY_SESSION_REMOTE_SYNC] ?? "enabled") === "enabled";
  } catch {
    return true;
  }
}
