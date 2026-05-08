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

import { readFile } from "node:fs/promises";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR, resolveCurrentBranchName, resolveUserIdentity } from "../shared.js";

import { runReleaseCommit, type SpawnGit } from "./commit.js";

export interface HandleReleaseCommitOptions {
  args: readonly string[];
}

/**
 * `arc release commit` Commander entry point. Resolves the I/O surface
 * needed by the orchestrator and delegates. Refusal paths print to
 * stderr and exit with the matched refusal code (10–13); the success
 * path is not yet implemented.
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
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Real wrapped-`git commit` invocation. Stubbed: the orchestrator's
 * authorization branch already rejects internally, so the refusal
 * cascade never reaches this stub. A user who invokes the wrapper with
 * an authorizing config sees the rejection surface as a top-level CLI
 * error — the spawn-and-capture wiring is not yet implemented.
 */
const realSpawnGit: SpawnGit = () =>
  Promise.reject(
    new Error("`arc release commit` success path is not yet implemented"),
  );
