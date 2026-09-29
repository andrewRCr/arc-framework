/**
 * Commander adapter for `arc release commit`.
 *
 * Resolves real I/O (identity, ARC root, settings, current branch) and
 * delegates to the pure {@link runReleaseCommit} orchestrator. Keeps
 * the orchestrator testable as a unit (synthetic settings, fake
 * stderr, no subprocess); this thin wrapper handles the
 * Commander → orchestrator boundary.
 *
 * @module
 */

import { access, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { execa } from "execa";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { hasEffectiveHook } from "../../lib/hook-manager.js";
import { createGitExec } from "../../lib/io-context.js";
import {
  formatMissingHooksPathMessage,
  resolveHooksPathVerdict,
} from "../../lib/git/hooks-path.js";
import { environmentForGitCwd, MAX_GIT_OUTPUT_BYTES } from "../../lib/git/process-executor.js";
import type { GitExec } from "../../lib/git/exec.js";
import { normalizeGitRejection } from "../../lib/git/process-error.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { renderCommitMessageRemedy } from "../../lib/release/commit-message-remedy.js";
import { createCommitMessageRetryStore } from "../../lib/release/commit-message-retry-store.js";
import {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
} from "../../lib/advisory-lock.js";
import { ARC_PROJECT_ROOT_ERROR, resolveCurrentBranchName, resolveUserIdentity } from "../shared.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../../lib/command-input/interaction-context.js";
import { declareInteractionSite, type CommandInputDeclaration } from "../../lib/command-input/declaration.js";

import {
  runReleaseCommit,
  type CreateCommitMessageSnapshot,
  type ResolveHead,
  type SpawnGit,
} from "./commit.js";
import { createCommitMessagePreflight } from "./commit-message-preflight.js";

export interface HandleReleaseCommitOptions {
  args: readonly string[];
}

/** Input and interaction policies owned by the release-commit adapter. */
export const releaseCommitInputPolicyDeclarations = [{
  commandPath: "release commit",
  aliases: [],
  sites: [
    {
      id: "operand.args", source: { file: "cli.ts", symbol: "program" }, origin: "syntax",
      acquisition: "opaque-passthrough", schemaOwnership: "opaque", cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: ["[args]"] },
      mutationBoundary: "release commit handler", subprocess: "opaque-arguments",
    },
    declareInteractionSite(
      { file: "handlers/release/commit-cli.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "release commit input preflight", subprocess: "explicit-stdin",
      },
    ),
    declareInteractionSite(
      { file: "handlers/release/commit-cli.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      {
        acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "disable-terminal-input", flags: [], acceptedSyntax: [] },
        mutationBoundary: "release commit subprocess boundary", subprocess: "editor",
      },
    ),
  ],
}] satisfies readonly CommandInputDeclaration[];

/**
 * Strip a leading `--no-wrap` token from `args`, honoring the `--` terminator.
 *
 * @param args - Raw commit argv as received from Commander.
 * @returns The stripped argv and whether body-wrapping remains enabled.
 */
export function stripNoWrap(args: readonly string[]): { argv: string[]; wrap: boolean } {
  if (args[0] === "--no-wrap") return { argv: args.slice(1), wrap: false };
  return { argv: [...args], wrap: true };
}

/**
 * `arc release commit` Commander entry point. Resolves the I/O surface
 * needed by the orchestrator and delegates. Refusal paths print to
 * stderr and exit with the matched refusal code (10–13 or message-preflight 16); the authorize
 * path forwards to a wrapped `git commit` invocation that bubbles git's
 * stdout, stderr, and exit code verbatim.
 */
export async function handleReleaseCommit(
  opts: HandleReleaseCommitOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false, machineReadable: false, yes: "absent",
  });
  const exec = createGitExec(context.subprocess);
  let identity: string;
  try {
    identity = await resolveUserIdentity(exec);
  } catch (err) {
    if (err instanceof UserFacingError) {
      process.stderr.write(`${formatError(err)}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const cwd = resolveArcRoot(process.cwd());
  if (cwd === null) {
    process.stderr.write(`${ARC_PROJECT_ROOT_ERROR}\n`);
    process.exitCode = 1;
    return;
  }

  // Fail closed when core.hooksPath points at a missing directory: Git would
  // otherwise commit with zero hooks and report success (unprovisioned worktrees).
  try {
    const hooksVerdict = await resolveHooksPathVerdict(cwd, async (command, args, opts) => {
      const { stdout } = await exec(command, [...args], { cwd: opts.cwd });
      return { stdout };
    });
    if (hooksVerdict.kind === "missing") {
      process.stderr.write(formatMissingHooksPathMessage(hooksVerdict, "arc release commit"));
      process.exitCode = 1;
      return;
    }
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(
      `error: could not resolve core.hooksPath before commit: ${detail}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const settings = await resolveAllSettings({
    cwd,
    exec,
    readFile: (path) => readFile(path, "utf-8"),
  });

  const currentBranch = (await resolveCurrentBranchName(exec)) ?? "";
  const preflightRemedy = renderCommitMessageRemedy();
  const { argv, wrap } = stripNoWrap(opts.args);
  const retryStore = createRealCommitMessageRetryStore(exec);

  const result = await runReleaseCommit({
    cwd,
    identity,
    argv,
    settings,
    currentBranch,
    spawnGit: createSpawnGit(context),
    resolveHead: realResolveHead(exec),
    createMessageSnapshot: createRealCommitMessageSnapshot(exec),
    persistMessageRetry: retryStore.persist,
    cleanupConsumedMessageRetry: retryStore.cleanup,
    preflightRemedy,
    preflightCommitMessage: createCommitMessagePreflight({
      stdinIsTTY: context.interaction === "allowed" && context.promptInput.isTTY,
      interactionAllowed: context.interaction === "allowed",
      readFile: (path) => readFile(path),
      readFileWithIdentity: retryStore.readFileWithIdentity,
      readStdin,
      setupRepository: (root) => createDefaultCommitCheckRepository(root, {
        exec,
        readFile: (path) => readFile(path, "utf8"),
        pathExists,
      }),
      hasPrepareCommitMsgHook: (root) => hasPrepareCommitMsgHook(root, exec),
      wrap,
    }),
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function hasPrepareCommitMsgHook(cwd: string, exec: GitExec): Promise<boolean> {
  return hasEffectiveHook(cwd, "prepare-commit-msg", {
    access,
    readFile: (path) => readFile(path, "utf8"),
    resolveGitHookPath: async (root, name) => {
      const { stdout } = await exec(
        "git",
        ["rev-parse", "--path-format=absolute", "--git-path", `hooks/${name}`],
        { cwd: root },
      );
      return stdout.trim();
    },
  });
}

/**
 * Wrapped `git commit` invocation. Inherits stdin so the editor (commit-message
 * prompt, interactive rebase) works as expected; pipes stdout and stderr so the
 * captured streams support hash extraction and hook-failure attribution while
 * being teed verbatim to the user's terminal.
 *
 * @returns A `SpawnGit` adapter with captured output and guarded stdin transport
 */
export function createSpawnGit(context?: InteractionContext, inheritOutput = true): SpawnGit {
  return async ({ args, cwd, stdin }) => {
    const invocation = ["commit", ...args];
    const forbidden = context?.subprocess.terminalPrompts === "forbidden";
    const env = forbidden
      ? {
          ...(environmentForGitCwd(cwd) ?? process.env),
          GIT_TERMINAL_PROMPT: "0",
          GIT_EDITOR: "true",
          GIT_PAGER: "cat",
          PAGER: "cat",
        }
      : environmentForGitCwd(cwd);
    const subprocess = execa("git", invocation, {
      cwd,
      env,
      extendEnv: false,
      ...(stdin === undefined
        ? { stdin: context?.subprocess.ambientStdin === "closed" ? "ignore" as const : "inherit" as const }
        : { input: stdin }),
      stdout: inheritOutput ? ["inherit", "pipe"] : "pipe",
      stderr: inheritOutput ? ["inherit", "pipe"] : "pipe",
      reject: false,
      stripFinalNewline: false,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    // Execa normally waits for captured-stream EOF after the child exits. A hook can
    // background a descendant that inherits those descriptors, so close ARC's read
    // ends at the direct Git boundary instead of waiting on unrelated process lifetime.
    subprocess.nodeChildProcess.once("exit", () => {
      subprocess.stdout.destroy();
      subprocess.stderr.destroy();
    });
    const result = await subprocess;
    if (!result.failed) return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };

    const error = normalizeGitRejection(result, { command: "git", args: invocation });
    if (error.kind !== "nonzero-exit" || error.exitCode === undefined) throw error;
    return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr };
  };
}

/** Capture commit-message bytes under the Git directory resolved by this invocation. */
export const createRealCommitMessageSnapshot = (exec: GitExec): CreateCommitMessageSnapshot => async ({ cwd, bytes }) => {
  const { stdout } = await exec("git", ["rev-parse", "--absolute-git-dir"], { cwd });
  const path = join(stdout.trim(), `.arc-release-commit-message-${randomUUID()}`);
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
  } catch (cause: unknown) {
    await handle.close();
    await unlink(path).catch(() => undefined);
    throw cause;
  }
  await handle.close();
  return { path, cleanup: () => unlink(path) };
};

function formatFileIdentity(stats: { dev: bigint; ino: bigint }): string {
  return `${String(stats.dev)}:${String(stats.ino)}`;
}

/**
 * Read one file generation through one handle.
 *
 * @param path - Commit-message file to capture.
 * @returns Captured bytes plus opaque filesystem identity.
 */
async function readRealCommitMessageFileWithIdentity(path: string): Promise<{
  bytes: Uint8Array;
  identity: string;
}> {
  const handle = await open(path, "r");
  try {
    const identity = formatFileIdentity(await handle.stat({ bigint: true }));
    return { bytes: await handle.readFile(), identity };
  } finally {
    await handle.close();
  }
}

/** Bind retry persistence, cleanup, and generation reads to one Git executor. */
export function createRealCommitMessageRetryStore(exec: GitExec) {
  const store = createCommitMessageRetryStore({
    resolveGitDir: async (cwd) => {
      const { stdout } = await exec("git", ["rev-parse", "--absolute-git-dir"], { cwd });
      return stdout.trim();
    },
    randomId: randomUUID,
    openPrivate: async (path) => open(path, "wx", 0o600),
    identifyFile: async (path) => formatFileIdentity(await stat(path, { bigint: true })),
    rename,
    unlink,
    withLock: async (path, operation) => {
      const handle = await acquireAdvisoryLock(path);
      try {
        return await operation();
      } finally {
        await releaseAdvisoryLock(handle);
      }
    },
  });
  return {
    readFileWithIdentity: readRealCommitMessageFileWithIdentity,
    persist: store.persist,
    cleanup: store.cleanup,
  };
}

/** Resolves `HEAD` post-success for the audit entry's `hash` field. */
const realResolveHead = (exec: GitExec): ResolveHead => async ({ cwd }) => {
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
};
