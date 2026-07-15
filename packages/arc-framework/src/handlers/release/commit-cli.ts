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
import { access, constants, open, readFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { execFileAsync, gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { readMarker } from "../../lib/release/setup-marker.js";
import { renderCommitMessageRemedy } from "../../lib/release/commit-message-remedy.js";
import { COMMIT_MESSAGE_RETRY_FILENAME } from "../../lib/release/commit-message-retry.js";
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
 * stderr and exit with the matched refusal code (10–13); the authorize
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
  const marker = await readMarker({ cwd, identity });
  const preflightRemedy = renderCommitMessageRemedy(marker.ok ? marker.marker.harnesses : []);

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
    { cwd },
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
 */
const realSpawnGit: SpawnGit = ({ args, cwd, stdin }) =>
  new Promise((resolve, reject) => {
    const proc = spawn("git", ["commit", ...args], {
      stdio: [stdin === undefined ? "inherit" : "pipe", "pipe", "pipe"],
      cwd,
    });
    let stdout = "";
    let stderr = "";
    if (proc.stdout === null || proc.stderr === null) {
      reject(new Error("git commit did not expose captured output streams"));
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
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    if (stdin !== undefined && proc.stdin !== null) proc.stdin.end(stdin);
  });

export const createRealCommitMessageSnapshot: CreateCommitMessageSnapshot = async ({ cwd, bytes }) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd });
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
  const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd: opts.cwd });
  const gitDir = stdout.trim();
  const path = join(gitDir, COMMIT_MESSAGE_RETRY_FILENAME);
  const temporaryPath = join(gitDir, `.arc-release-commit-message-retry-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(opts.bytes);
    await handle.close();
    await rename(temporaryPath, path);
  } catch (cause: unknown) {
    await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw cause;
  }
  return { path };
}

/**
 * Remove an unchanged wrapper-owned retry file after successful consumption.
 *
 * @param opts - Repository root, original file operand, and captured source bytes.
 * @returns Whether the wrapper-owned path was removed.
 */
export async function cleanupRealConsumedMessageRetry(opts: {
  cwd: string;
  sourcePath: string;
  bytes: Uint8Array;
}): Promise<boolean> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--absolute-git-dir"], { cwd: opts.cwd });
  const path = join(stdout.trim(), COMMIT_MESSAGE_RETRY_FILENAME);
  if (resolve(opts.cwd, opts.sourcePath) !== path) return false;

  let current: Uint8Array;
  try {
    current = await readFile(path);
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
  if (current.length !== opts.bytes.length || current.some((byte, index) => byte !== opts.bytes[index])) {
    return false;
  }
  try {
    await unlink(path);
  } catch (cause: unknown) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
  }
  return true;
}

/** Resolves `HEAD` post-success for the audit entry's `hash` field. */
const realResolveHead: ResolveHead = async ({ cwd }) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
};
