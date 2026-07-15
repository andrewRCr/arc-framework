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
import { access, readFile } from "node:fs/promises";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { execFileAsync, gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { ARC_PROJECT_ROOT_ERROR, resolveCurrentBranchName, resolveUserIdentity } from "../shared.js";

import { runReleaseCommit, type ResolveHead, type SpawnGit } from "./commit.js";
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

  const result = await runReleaseCommit({
    cwd,
    identity,
    argv: opts.args,
    settings,
    currentBranch,
    spawnGit: realSpawnGit,
    resolveHead: realResolveHead,
    preflightCommitMessage: createCommitMessagePreflight({
      stdinIsTTY: process.stdin.isTTY,
      readFile: (path) => readFile(path),
      readStdin,
      setupRepository: (root) => createDefaultCommitCheckRepository(root, {
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
        pathExists,
      }),
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

/**
 * Wrapped `git commit` invocation. Inherits stdin so the editor (commit-message
 * prompt, interactive rebase) works as expected; pipes stdout and stderr so the
 * captured streams support hash extraction and hook-failure attribution while
 * being teed verbatim to the user's terminal.
 */
const realSpawnGit: SpawnGit = ({ args, cwd }) =>
  new Promise((resolve, reject) => {
    const proc = spawn("git", ["commit", ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd,
    });
    let stdout = "";
    let stderr = "";
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
  });

/** Resolves `HEAD` post-success for the audit entry's `hash` field. */
const realResolveHead: ResolveHead = async ({ cwd }) => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
};
