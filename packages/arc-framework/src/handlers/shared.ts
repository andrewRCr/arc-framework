/**
 * Shared utilities for CLI command handlers.
 *
 * Common patterns extracted from individual handlers: spinners, error
 * boundaries, identity resolution, environment detection, config reading.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { resolveIdentity, isGitRepo, type GitExec } from "../lib/git/index.js";
import { resolveArcRoot } from "../lib/paths.js";
import { formatError, UserFacingError } from "../lib/errors.js";
import {
  UserSaveError,
  type UserFetchResult,
  type UserPullResult,
} from "../commands/user.js";
import { gitExec } from "../lib/io-context.js";
import type { SyncOutput } from "../lib/sync-output.js";

// --- Spinner ---

/**
 * Run an async operation with a routed spinner. Stops the spinner on success
 * or failure and re-throws errors for the caller to handle. The spinner is
 * obtained from `output.spinner()` so JSON-mode callers route the cursor
 * codes and labels through a no-op spinner rather than emitting clack
 * artifacts to stdout. Human-mode callers pass `createSyncOutput(false)` for
 * pass-through to `@clack/prompts`.
 *
 * Verb-tense convention for user/sync CLI output:
 * - `label` (in-progress): present continuous — "Saving user directory...".
 * - `doneLabel` (success): completed adjective — "Save complete.".
 * - Failure label emitted here is "Failed."; callers that need a specific
 *   failure label (e.g., "Pull failed.") manage their own spinner inline via
 *   `output.spinner()`.
 * - Result-box labels (`output.note(..., "Label")`): past tense matching the
 *   caller's outer verb, not the internal function called — "Pulled" for
 *   `arc sync pull` and `arc user pull` even though they consume
 *   `buildLoadSummary`; "Loaded" only for `arc user load`.
 */
export async function runWithSpinner<T>(
  output: SyncOutput,
  label: string,
  fn: () => Promise<T>,
  doneLabel: string,
): Promise<T> {
  const spinner = output.spinner();
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

/** True when a pull result stopped at the fetch boundary rather than loading disk. */
export function isUserFetchOutcome(result: UserPullResult): result is UserFetchResult {
  return result !== null && result.kind !== "loaded";
}

/** True when a fetch outcome means the remote ref was applied locally. */
export function isUserFetchSuccess(result: UserFetchResult): boolean {
  return result.kind === "fast-forwarded" || result.kind === "created";
}

/** Surface a typed fetch refusal/failure and set the process exit code. */
export function reportUserFetchOutcome(
  result: UserFetchResult,
  identity: string,
  operation: "fetch" | "pull",
): void {
  switch (result.kind) {
    case "fast-forwarded":
    case "created":
      return;
    case "refused-local-ahead":
      p.log.error(`Local notes for "${identity}" are ahead of remote; ${operation} would discard them.`);
      p.log.info("Run `arc user push` or `arc sync` to reconcile, then retry.");
      process.exitCode = 1;
      return;
    case "refused-diverged":
      p.log.error(`Local and remote notes for "${identity}" have diverged; ${operation} would discard local notes.`);
      p.log.info("Run `arc user push` or `arc sync` to reconcile, then retry.");
      process.exitCode = 1;
      return;
    case "remote-unavailable": {
      const msg = result.error.message;
      if (isRemoteError(msg)) {
        p.log.error(`No remote configured. ${capitalize(operation)} requires a remote repository.`);
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

      p.log.error(`Failed to ${operation} user notes: ${msg}`);
      process.exitCode = 1;
      return;
    }
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

/** Canonical error copy when the current directory is outside any ARC project root. */
export const ARC_PROJECT_ROOT_ERROR =
  "Not inside an ARC project (no .arc/ directory found walking up from cwd).";

/**
 * Resolve the nearest ARC project root from the current working directory.
 *
 * Logs the canonical error and sets exit code 1 when no `.arc/` directory is
 * found walking upward.
 */
export function requireArcProjectRoot(startDir = process.cwd()): string | null {
  const root = resolveArcRoot(startDir);
  if (root) {
    return root;
  }

  p.log.error(ARC_PROJECT_ROOT_ERROR);
  process.exitCode = 1;
  return null;
}

/**
 * Resolve the current branch name via `git rev-parse --abbrev-ref HEAD`.
 * Returns `null` for detached HEAD or when the probe fails — the pushability
 * matrix's alignment probe expects a branch name; absence falls through to no
 * gate (existing matrix conditions cover detached-head separately).
 */
export async function resolveCurrentBranchName(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    const trimmed = stdout.trim();
    return trimmed === "" || trimmed === "HEAD" ? null : trimmed;
  } catch {
    return null;
  }
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
