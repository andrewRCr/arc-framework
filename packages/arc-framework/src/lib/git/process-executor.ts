/**
 * Execa-backed implementations of the injectable Git process seams.
 *
 * @module
 */

import { execa } from "execa";

import type { GitExec, GitExecInput } from "./exec.js";
import { normalizeGitRejection } from "./process-error.js";

/** Captured-output ceiling retained by every Git process binding. */
export const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

const GIT_REPOSITORY_LOCAL_ENVIRONMENT = new Set<string>([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
]);

/**
 * Build an environment where `cwd` selects the Git repository.
 *
 * @param cwd - Repository working directory, when the command is cwd-scoped.
 * @returns The inherited environment without repository-local Git overrides.
 */
export function environmentForGitCwd(cwd: string | undefined): NodeJS.ProcessEnv | undefined {
  if (cwd === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(process.env).filter(([variable]) => !GIT_REPOSITORY_LOCAL_ENVIRONMENT.has(variable)),
  );
}

/**
 * Construct the captured-output execa adapter without changing the live binding.
 *
 * @param maxBuffer - Captured-output ceiling; injectable only for focused process-boundary tests.
 * @returns A plain-Promise {@link GitExec} implementation.
 */
export function createExecaGitExec(maxBuffer = MAX_GIT_OUTPUT_BYTES): GitExec {
  return async (command, args, options) => {
    const environment = environmentForGitCwd(options?.cwd);
    const indexedEnvironment = options?.indexFile === undefined
      ? environment
      : { ...(environment ?? process.env), GIT_INDEX_FILE: options.indexFile };
    const diagnosticEnvironment = options?.diagnosticLocale === "stable"
      ? { ...(indexedEnvironment ?? process.env), LC_ALL: "C", LANG: "C" }
      : indexedEnvironment;
    const objectEnvironment = options?.objectAccess === "local-only"
      ? { ...(diagnosticEnvironment ?? process.env), GIT_NO_LAZY_FETCH: "1" }
      : diagnosticEnvironment;
    const forbidden = options?.interaction?.terminalPrompts === "forbidden";
    const env = forbidden
      ? {
          ...(objectEnvironment ?? process.env),
          GIT_TERMINAL_PROMPT: "0",
          GIT_EDITOR: "true",
          GIT_PAGER: "cat",
          PAGER: "cat",
        }
      : objectEnvironment;
    const effectiveArgs = options?.objectAccess === "local-only"
      ? ["--no-lazy-fetch", ...args]
      : args;
    try {
      const result = await execa(command, effectiveArgs, {
        cwd: options?.cwd,
        env,
        extendEnv: env === undefined,
        cancelSignal: options?.signal,
        maxBuffer,
        stripFinalNewline: false,
        ...(options?.interaction?.ambientStdin === "closed" ? { stdin: "ignore" as const } : {}),
      });
      return { stdout: result.stdout.trimEnd(), stderr: result.stderr };
    } catch (error) {
      throw normalizeGitRejection(error, { command, args: effectiveArgs });
    }
  };
}

/**
 * Construct the stdin-fed execa adapter without changing the live binding.
 *
 * @param maxBuffer - Captured-output ceiling; injectable only for focused process-boundary tests.
 * @returns A raw-stdout {@link GitExecInput} implementation.
 */
export function createExecaGitExecInput(maxBuffer = MAX_GIT_OUTPUT_BYTES): GitExecInput {
  return async (args, input, options) => {
    const environment = environmentForGitCwd(options?.cwd);
    const env = options?.objectAccess === "local-only"
      ? { ...(environment ?? process.env), GIT_NO_LAZY_FETCH: "1" }
      : environment;
    const effectiveArgs = options?.objectAccess === "local-only"
      ? ["--no-lazy-fetch", ...args]
      : args;
    try {
      const result = await execa("git", effectiveArgs, {
        cwd: options?.cwd,
        env,
        extendEnv: env === undefined,
        input,
        maxBuffer,
        stripFinalNewline: false,
      });
      return result.stdout;
    } catch (error) {
      throw normalizeGitRejection(error, { command: "git", args: effectiveArgs });
    }
  };
}
