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
import { createGitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import {
  runPushabilityStatus,
  runMaterializingWorktreeInspection,
} from "../../lib/git/index.js";
import type { GitExec } from "../../lib/git/exec.js";
import { pushWorktreeBranch } from "../../lib/git/push-worktree.js";
import { normalizeGitRejection } from "../../lib/git/process-error.js";
import { ARC_PROJECT_ROOT_ERROR, resolveUserIdentity } from "../shared.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../../lib/command-input/interaction-context.js";
import type { CommandInputDeclaration } from "../../lib/command-input/declaration.js";

import { runReleasePush, type SpawnPush } from "./push.js";

export interface HandleReleasePushOptions {
  args: readonly string[];
}

/** Opaque argument policy owned by the release-push adapter. */
export const releasePushInputPolicyDeclarations = [{
  commandPath: "release push",
  aliases: [],
  sites: [{
    id: "operand.args", source: { file: "cli.ts", symbol: "program" }, origin: "syntax",
    acquisition: "opaque-passthrough", schemaOwnership: "opaque", cancellation: "not-applicable",
    automation: { noInput: "same", flags: [], acceptedSyntax: ["[args]"] },
    mutationBoundary: "release push handler", subprocess: "opaque-arguments",
  }],
}] satisfies readonly CommandInputDeclaration[];

/**
 * `arc release push` Commander entry point. Resolves the I/O surface
 * needed by the orchestrator and delegates. Refusal paths print to
 * stderr and exit with the matched refusal code (10–14); the authorize
 * path forwards to a wrapped `git push` invocation that inherits stdout
 * for verbatim bubbling and captures stderr for `refStatus` parsing.
 */
export async function handleReleasePush(
  opts: HandleReleasePushOptions,
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

  const settings = await resolveAllSettings({
    cwd,
    exec,
    readFile: (path) => readFile(path, "utf-8"),
  });

  const worktreeSync = await runMaterializingWorktreeInspection({ exec, cwd });
  const currentBranch = worktreeSync.branch ?? "";

  const result = await runReleasePush({
    cwd,
    identity,
    argv: opts.args,
    settings,
    currentBranch,
    runPushability: () =>
      runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: currentBranch,
        worktreeSyncState: worktreeSync.state,
      }),
    spawnPush: createRealSpawnPush(exec, context.subprocess),
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

/**
 * Wrapped `git push` invocation. Delegates to {@link pushWorktreeBranch}
 * with `inheritStdio: true`: stdout streams verbatim to the user's
 * terminal, stderr is captured + teed for `refStatus` parsing post-push.
 *
 * Reshapes the helper's `failed` arm into the orchestrator's first-class
 * `exitCode` field so audit attribution uses structured process evidence.
 */
const createRealSpawnPush = (
  exec: GitExec,
  interaction: InteractionContext["subprocess"],
): SpawnPush => async ({ branch, args, cwd }) => {
  const result = await pushWorktreeBranch({
    exec,
    branch,
    args,
    cwd,
    inheritStdio: true,
    interaction,
  });
  if (result.status === "success") {
    return { status: "success", stdout: result.stdout, stderr: result.stderr };
  }
  return {
    status: "failed",
    exitCode: normalizeGitRejection(result.error, {
      command: "git", args: ["push", "origin", branch, ...args],
    }).exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
