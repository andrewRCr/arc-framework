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

import { spawn } from "node:child_process";
import { access, constants, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { environmentForGitCwd, execFileAsync, gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { renderCommitMessageRemedy } from "../../lib/release/commit-message-remedy.js";
import { createCommitMessageRetryStore } from "../../lib/release/commit-message-retry-store.js";
import {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
} from "../../lib/user-sync/notes-lock.js";
import { ARC_PROJECT_ROOT_ERROR, resolveCurrentBranchName, resolveUserIdentity } from "../shared.js";

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

/**
 * `arc release commit` Commander entry point. Resolves the I/O surface
 * needed by the orchestrator and delegates. Refusal paths print to
 * stderr and exit with the matched refusal code (10–13 or message-preflight 16); the authorize
 * path forwards to a wrapped `git commit` invocation that bubbles git's
 * stdout, stderr, and exit code verbatim.
 */
export async function handleReleaseCommit(opts: HandleReleaseCommitOptions): Promise<void> {
  let identity: string;
  try {
    identity = await resolveUserIdentity();
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

  const settings = await resolveAllSettings({
    cwd,
    exec: gitExec,
    readFile: (path) => readFile(path, "utf-8"),
  });

  const currentBranch = (await resolveCurrentBranchName(gitExec)) ?? "";
  const preflightRemedy = renderCommitMessageRemedy();

  const result = await runReleaseCommit({
    cwd,
    identity,
    argv: opts.args,
    settings,
    currentBranch,
    spawnGit: realSpawnGit,
    resolveHead: realResolveHead,
    createMessageSnapshot: createRealCommitMessageSnapshot,
    persistMessageRetry: persistRealCommitMessageRetry,
    cleanupConsumedMessageRetry: cleanupRealConsumedMessageRetry,
    preflightRemedy,
    preflightCommitMessage: createCommitMessagePreflight({
      stdinIsTTY: process.stdin.isTTY,
      readFile: (path) => readFile(path),
      readFileWithIdentity: readRealCommitMessageFileWithIdentity,
      readStdin,
      setupRepository: (root) => createDefaultCommitCheckRepository(root, {
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
        pathExists,
      }),
      hasPrepareCommitMsgHook,
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

async function hasPrepareCommitMsgHook(cwd: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "hooks/prepare-commit-msg"],
    { cwd, env: environmentForGitCwd(cwd) },
  );
  try {
    await access(stdout.trim(), constants.X_OK);
    return true;
  } catch (cause: unknown) {
    if (
      cause instanceof Error
      && "code" in cause
      && (cause.code === "ENOENT" || cause.code === "EACCES")
    ) return false;
    throw cause;
  }
}

/**
 * Wrapped `git commit` invocation. Inherits stdin so the editor (commit-message
 * prompt, interactive rebase) works as expected; pipes stdout and stderr so the
 * captured streams support hash extraction and hook-failure attribution while
 * being teed verbatim to the user's terminal.
 *
 * @param spawnProcess - Child-process factory used for the wrapped Git invocation
 * @returns A `SpawnGit` adapter with captured output and guarded stdin transport
 */
export function createSpawnGit(spawnProcess: typeof spawn): SpawnGit {
  return ({ args, cwd, stdin }) => new Promise((resolve, reject) => {
    const proc = spawnProcess("git", ["commit", ...args], {
      stdio: [stdin === undefined ? "inherit" : "pipe", "pipe", "pipe"],
      cwd,
      env: environmentForGitCwd(cwd),
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let fatalTransportError: Error | null = null;
    const toError = (cause: unknown): Error => cause instanceof Error
      ? cause
      : new Error("git commit subprocess failed", { cause });
    const rejectOnce = (cause: unknown): void => {
      if (settled) return;
      settled = true;
      reject(toError(cause));
    };
    const terminateForTransportError = (cause: unknown): void => {
      if (settled || fatalTransportError !== null) return;
      fatalTransportError = toError(cause);
      proc.kill("SIGKILL");
    };
    if (proc.stdout === null || proc.stderr === null) {
      proc.kill("SIGKILL");
      rejectOnce(new Error("git commit did not expose captured output streams"));
      return;
    }
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    proc.on("error", rejectOnce);
    proc.on("close", (code) => {
      if (settled) return;
      if (fatalTransportError !== null) {
        rejectOnce(fatalTransportError);
        return;
      }
      settled = true;
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    if (stdin !== undefined) {
      if (proc.stdin === null) {
        terminateForTransportError(new Error("git commit did not expose writable stdin"));
        return;
      }
      proc.stdin.on("error", (cause: unknown) => {
        if (cause instanceof Error && "code" in cause && cause.code === "EPIPE") return;
        terminateForTransportError(cause);
      });
      proc.stdin.end(stdin);
    }
  });
}

const realSpawnGit = createSpawnGit(spawn);

export const createRealCommitMessageSnapshot: CreateCommitMessageSnapshot = async ({ cwd, bytes }) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], {
    cwd,
    env: environmentForGitCwd(cwd),
  });
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
export async function readRealCommitMessageFileWithIdentity(path: string): Promise<{
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

const realCommitMessageRetryStore = createCommitMessageRetryStore({
  resolveGitDir: async (cwd) => {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], {
      cwd,
      env: environmentForGitCwd(cwd),
    });
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

/**
 * Atomically replace the worktree-local latest-retry message with private bytes.
 *
 * @param opts - Repository root and canonical approved message bytes.
 * @returns The absolute wrapper-owned retry path.
 */
export async function persistRealCommitMessageRetry(opts: {
  cwd: string;
  bytes: Uint8Array;
}): Promise<{ path: string }> {
  return realCommitMessageRetryStore.persist(opts);
}

/**
 * Remove the same wrapper-owned retry generation after successful consumption.
 *
 * @param opts - Repository root, original file operand, and captured generation identity.
 * @returns Whether the wrapper-owned path was removed.
 */
export async function cleanupRealConsumedMessageRetry(opts: {
  cwd: string;
  sourcePath: string;
  sourceIdentity: string;
}): Promise<boolean> {
  return realCommitMessageRetryStore.cleanup(opts);
}

/** Resolves `HEAD` post-success for the audit entry's `hash` field. */
const realResolveHead: ResolveHead = async ({ cwd }) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd,
    env: environmentForGitCwd(cwd),
  });
  return stdout.trim();
};
