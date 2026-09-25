/** Release-interlocked adapters for machine-owned delivery correction records. */

import { access, readFile } from "node:fs/promises";

import { createDefaultCommitCheckRepository } from "../lib/commit-check/repository.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { resolveAllSettings } from "../lib/config/resolved-settings.js";
import type { ResolvedSettingsResult } from "../lib/config/resolved-settings.js";
import type { DeliveryReviewFixRecordEffectPorts } from
  "../lib/delivery/review-fix-record-effects.js";
import {
  deliveryReviewFixRecordCommitMessagesMatch,
  deliveryReviewFixRecordDigest,
} from
  "../lib/delivery/review-fix-record-effects.js";
import { canonicalize, sortByCanonicalBytes } from "../lib/kernel/index.js";
import { observeDeliveryRemoteRef } from "../lib/delivery/git-materialization.js";
import type { GitExec } from "../lib/git/exec.js";
import { hasEffectiveHook } from "../lib/hook-manager.js";
import {
  normalizeGitRejection,
  runMaterializingWorktreeInspection,
  runPushabilityStatus,
} from "../lib/git/index.js";
import {
  formatMissingHooksPathMessage,
  resolveHooksPathVerdict,
} from "../lib/git/hooks-path.js";
import { pushWorktreeBranch } from "../lib/git/push-worktree.js";
import { renderCommitMessageRemedy } from "../lib/release/commit-message-remedy.js";
import { createCommitMessagePreflight } from "./release/commit-message-preflight.js";
import {
  cleanupRealConsumedMessageRetry,
  createRealCommitMessageSnapshot,
  createSpawnGit,
  persistRealCommitMessageRetry,
  readRealCommitMessageFileWithIdentity,
} from "./release/commit-cli.js";
import { runReleaseCommit } from "./release/commit.js";
import { runReleasePush, type SpawnPush } from "./release/push.js";

function lines(...values: readonly string[]): string[] {
  return values.flatMap((value) => value.trim() === "" ? [] : [value.trim()]);
}

function authorizeMachineOwnedRecordEffects(settings: ResolvedSettingsResult): ResolvedSettingsResult {
  return {
    ...settings,
    resolved: {
      ...settings.resolved,
      commitInterlock: { ...settings.resolved.commitInterlock, value: "on-workflow" },
      pushInterlock: { ...settings.resolved.pushInterlock, value: "on-workflow" },
    },
  };
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

async function currentBranch(exec: GitExec, cwd: string): Promise<string | null> {
  try {
    const branch = (await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd }))
      .stdout.trim();
    return branch === "" ? null : branch;
  } catch {
    return null;
  }
}

async function runRecordCommit(input: {
  readonly cwd: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly interaction?: InteractionContext;
  readonly paths: readonly string[];
  readonly message: string;
}) {
  const branch = await currentBranch(input.exec, input.cwd);
  if (branch === null) return { status: "refused" as const, reason: "record-effect-branch-unavailable" };
  const diagnostics: string[] = [];
  try {
    const hooksVerdict = await resolveHooksPathVerdict(input.cwd, async (command, args, options) => {
      const { stdout } = await input.exec(command, [...args], { cwd: options.cwd });
      return { stdout };
    });
    if (hooksVerdict.kind === "missing") {
      return {
        status: "refused" as const,
        reason: "record-effect-commit-failed",
        diagnostics: lines(formatMissingHooksPathMessage(hooksVerdict, "delivery correction record commit")),
      };
    }
  } catch (error) {
    return {
      status: "refused" as const,
      reason: "record-effect-commit-failed",
      diagnostics: [
        `Could not resolve core.hooksPath before the correction record commit: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
  const settings = authorizeMachineOwnedRecordEffects(await resolveAllSettings({
    cwd: input.cwd,
    exec: input.exec,
    readFile: (path) => readFile(path, "utf8"),
  }));
  const baseSpawn = createSpawnGit(input.interaction, false);
  const result = await runReleaseCommit({
    cwd: input.cwd,
    identity: input.identity,
    argv: ["--only", "-m", input.message, "--", ...input.paths],
    settings,
    currentBranch: branch,
    spawnGit: async (options) => {
      const spawned = await baseSpawn(options);
      diagnostics.push(...lines(spawned.stdout, spawned.stderr));
      return spawned;
    },
    resolveHead: async ({ cwd }) => (
      await input.exec("git", ["rev-parse", "HEAD"], { cwd })
    ).stdout.trim(),
    createMessageSnapshot: createRealCommitMessageSnapshot,
    persistMessageRetry: persistRealCommitMessageRetry,
    cleanupConsumedMessageRetry: cleanupRealConsumedMessageRetry,
    preflightRemedy: renderCommitMessageRemedy(),
    preflightCommitMessage: createCommitMessagePreflight({
      stdinIsTTY: false,
      interactionAllowed: false,
      readFile: (path) => readFile(path),
      readFileWithIdentity: readRealCommitMessageFileWithIdentity,
      readStdin: () => Promise.reject(
        new Error("machine-owned correction commits never read stdin"),
      ),
      setupRepository: (root) => createDefaultCommitCheckRepository(root, {
        exec: input.exec,
        readFile: (path) => readFile(path, "utf8"),
        pathExists,
      }),
      hasPrepareCommitMsgHook: (cwd) => hasEffectiveHook(cwd, "prepare-commit-msg", {
        access,
        readFile: (path) => readFile(path, "utf8"),
        resolveGitHookPath: async (root, name) => (
          await input.exec(
            "git",
            ["rev-parse", "--path-format=absolute", "--git-path", `hooks/${name}`],
            { cwd: root },
          )
        ).stdout.trim(),
      }),
      wrap: true,
    }),
    writeStderr: (message) => diagnostics.push(...lines(message)),
  });
  if (result.exitCode !== 0) {
    return {
      status: "refused" as const,
      reason: "record-effect-commit-failed",
      diagnostics,
    };
  }
  const head = (await input.exec("git", ["rev-parse", "HEAD"], { cwd: input.cwd })).stdout.trim();
  return { status: "committed" as const, head };
}

async function runRecordPush(input: {
  readonly cwd: string;
  readonly remote: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly interaction?: InteractionContext;
  readonly branch: string;
}) {
  const diagnostics: string[] = [];
  const settings = authorizeMachineOwnedRecordEffects(await resolveAllSettings({
    cwd: input.cwd,
    exec: input.exec,
    readFile: (path) => readFile(path, "utf8"),
  }));
  const worktree = await runMaterializingWorktreeInspection({ exec: input.exec, cwd: input.cwd });
  if (worktree.branch !== input.branch) {
    return { status: "refused" as const, reason: "record-effect-branch-moved" };
  }
  const spawnPush: SpawnPush = async ({ branch, args, cwd }) => {
    const pushed = await pushWorktreeBranch({
      exec: input.exec,
      branch,
      remote: input.remote,
      args,
      cwd,
      inheritStdio: false,
      interaction: input.interaction?.subprocess,
    });
    diagnostics.push(...lines(pushed.stdout, pushed.stderr));
    if (pushed.status === "success") {
      return { status: "success", stdout: pushed.stdout, stderr: pushed.stderr };
    }
    return {
      status: "failed",
      exitCode: normalizeGitRejection(pushed.error, {
        command: "git",
        args: ["push", input.remote, branch, ...args],
      }).exitCode ?? 1,
      stdout: pushed.stdout,
      stderr: pushed.stderr,
    };
  };
  const result = await runReleasePush({
    cwd: input.cwd,
    identity: input.identity,
    argv: [],
    settings,
    currentBranch: input.branch,
    runPushability: () => runPushabilityStatus({
      exec: input.exec,
      access,
      target: "worktree",
      worktreeBranch: input.branch,
      worktreeSyncState: worktree.state,
    }),
    spawnPush,
    writeStderr: (message) => diagnostics.push(...lines(message)),
  });
  return result.exitCode === 0
    ? { status: "pushed" as const }
    : { status: "refused" as const, reason: "record-effect-push-failed", diagnostics };
}

/** Bind the correction record-effect core to the repository's release wrappers. */
export function createDeliveryReviewFixReleaseEffectPorts(input: {
  readonly cwd: string;
  readonly remote: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly interaction?: InteractionContext;
}): DeliveryReviewFixRecordEffectPorts {
  return {
    listStagedPaths: async () => {
      const output = (await input.exec(
        "git",
        ["diff", "--cached", "--name-only", "-z", "--"],
        { cwd: input.cwd },
      )).stdout;
      return output.split("\0").filter((path) => path !== "");
    },
    readStagedRecordDigest: async (path) => {
      try {
        const content = (await input.exec("git", ["show", `:${path}`], {
          cwd: input.cwd,
          objectAccess: "local-only",
        })).stdout;
        return deliveryReviewFixRecordDigest(content);
      } catch {
        return null;
      }
    },
    workingRecordMatchesStaged: async (path) => {
      try {
        await input.exec("git", ["diff", "--quiet", "--", path], {
          cwd: input.cwd,
          objectAccess: "local-only",
        });
        return true;
      } catch {
        return false;
      }
    },
    readCommittedRecordDigest: async (head, path) => {
      try {
        const content = (await input.exec("git", ["show", `${head}:${path}`], {
          cwd: input.cwd,
          objectAccess: "local-only",
        })).stdout;
        return deliveryReviewFixRecordDigest(content);
      } catch {
        return null;
      }
    },
    readRecoverableCommit: async ({ candidates }) => {
      const branch = await currentBranch(input.exec, input.cwd);
      if (branch === null) {
        return { status: "refused" as const, reason: "record-effect-branch-unavailable" };
      }
      const head = (await input.exec("git", ["rev-parse", "HEAD"], { cwd: input.cwd })).stdout.trim();
      const [pathsResult, messageResult] = await Promise.all([
        input.exec(
          "git",
          ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", "HEAD", "--"],
          { cwd: input.cwd, objectAccess: "local-only" },
        ),
        input.exec("git", ["log", "-1", "--format=%B"], {
          cwd: input.cwd,
          objectAccess: "local-only",
        }),
      ]);
      const paths = sortByCanonicalBytes(pathsResult.stdout.split("\0").filter((path) => path !== ""));
      const message = messageResult.stdout.trimEnd();
      const matches = candidates.filter((candidate) =>
        canonicalize(candidate.paths) === canonicalize(paths)
        && deliveryReviewFixRecordCommitMessagesMatch({ observed: message, expected: candidate.message }));
      if (matches.length > 1) {
        return { status: "refused" as const, reason: "record-effect-recovery-ambiguous" };
      }
      const matched = matches[0];
      if (matched === undefined) return { status: "none" as const };
      const ref = `refs/heads/${branch}`;
      const remote = await observeDeliveryRemoteRef(input.exec, input.remote, ref);
      if (remote.status === "refused") {
        return { status: "refused" as const, reason: "record-effect-remote-unavailable" };
      }
      if (remote.status === "absent") {
        return { status: "refused" as const, reason: "record-effect-recovery-unprovable" };
      }
      if (remote.head !== head) {
        let parent: string;
        try {
          parent = (await input.exec("git", ["rev-parse", "HEAD^"], { cwd: input.cwd })).stdout.trim();
        } catch {
          return { status: "none" as const };
        }
        if (parent !== remote.head) return { status: "none" as const };
      }
      return {
        status: "recoverable" as const,
        recordClass: matched.recordClass,
        paths: matched.paths,
        branch,
        head,
        beforeHead: remote.head,
      };
    },
    readCurrentBranch: () => currentBranch(input.exec, input.cwd),
    readRemoteHead: async (ref) => {
      const observed = await observeDeliveryRemoteRef(input.exec, input.remote, ref);
      return observed.status === "observed" ? observed.head : null;
    },
    commit: ({ paths, message }) => runRecordCommit({ ...input, paths, message }),
    push: ({ branch }) => runRecordPush({ ...input, branch }),
  };
}
