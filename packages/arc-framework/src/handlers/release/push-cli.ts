/**
 * Commander adapter for `arc release push`.
 *
 * Resolves real I/O (identity, ARC root, settings, current branch,
 * worktree-sync state) and delegates to the pure {@link runReleasePush}
 * orchestrator. Wires `runPushabilityStatus` with `target: "worktree"`,
 * the resolved `worktreeBranch` (alignment probe), and the pre-resolved
 * `worktreeSyncState` (force-push detection) so the matrix surfaces every
 * blocking condition the orchestrator can refuse on.
 *
 * @module
 */

import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { formatError, UserFacingError } from "../../lib/errors.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import {
  runPushabilityStatus,
  runWorktreeSyncStatus,
} from "../../lib/git/index.js";
import { pushWorktreeBranch } from "../../lib/git/push-worktree.js";
import { ARC_PROJECT_ROOT_ERROR, resolveCurrentBranchName, resolveUserIdentity } from "../shared.js";

import { runReleasePush, type SpawnPush } from "./push.js";

export interface HandleReleasePushOptions {
  args: readonly string[];
}

/**
 * `arc release push` Commander entry point. Resolves the I/O surface
 * needed by the orchestrator and delegates. Refusal paths print to
 * stderr and exit with the matched refusal code (10–14); the authorize
 * path forwards to a wrapped `git push` invocation that inherits stdout
 * for verbatim bubbling and captures stderr for `refStatus` parsing.
 */
export async function handleReleasePush(opts: HandleReleasePushOptions): Promise<void> {
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
  const remoteSyncEnabled = settings.settings["session.remote_sync"] === "enabled";
  const worktreeSync = await runWorktreeSyncStatus({ exec: gitExec, remoteSyncEnabled });

  const result = await runReleasePush({
    cwd,
    identity,
    argv: opts.args,
    settings,
    currentBranch,
    runPushability: () =>
      runPushabilityStatus({
        exec: gitExec,
        access,
        target: "worktree",
        worktreeBranch: currentBranch,
        worktreeSyncState: worktreeSync.state,
      }),
    spawnPush: realSpawnPush,
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Wrapped `git push` invocation. Delegates to {@link pushWorktreeBranch}
 * with `inheritStdio: true`: stdout streams verbatim to the user's
 * terminal, stderr is captured + teed for `refStatus` parsing post-push.
 */
const realSpawnPush: SpawnPush = ({ branch, args }) =>
  pushWorktreeBranch({
    exec: gitExec,
    branch,
    args,
    inheritStdio: true,
  });
