/**
 * Integration test for the `arc release push` no-upstream auto-resolution
 * path. Wires the real pushability matrix against tmpdir git repositories
 * with either a fresh branch or an activation rename that inherited its plan
 * upstream, threads the result through `runReleasePush`, and asserts the
 * wrapper auto-injects `-u` when `pushInterlock` permits.
 *
 * Unit tests in `__tests__/unit/handlers/release/push.test.ts` cover the
 * orchestrator's decision logic with synthetic conditions. This test
 * exercises the actual probe → orchestrator chain to confirm the matrix
 * surfaces `no-upstream-branch` as `caller-resolvable` against real git
 * state, and that the orchestrator picks it up correctly.
 *
 * Covers both activation failures: a genuinely no-upstream branch previously
 * refused with code 14, while a renamed branch could retain the obsolete plan
 * upstream and bypass auto-`-u` entirely.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { access } from "node:fs/promises";

import { runReleasePush } from "../../src/handlers/release/push.js";
import type { ReleasePushDeps } from "../../src/handlers/release/push.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { runPushabilityStatus } from "../../src/lib/git/pushability.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type {
  CommitInterlock,
  PushInterlock,
  ResolvedSettingsResult,
} from "../../src/lib/config/resolved-settings.js";
import type { ConfigSettings } from "../../src/commands/config/types.js";
import { reconcileBranch } from "../../src/lib/work-unit/mutators/reconcile-branch.js";

const execFileAsync = promisify(execFile);

async function createRepoOnFreshBranch(branch: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-release-push-integ-"));
  await execFileAsync("git", ["init", "--initial-branch=main", root]);
  await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
  await writeFile(join(root, "README.md"), "seed\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "seed"], { cwd: root });
  await execFileAsync("git", ["checkout", "-b", branch], { cwd: root });
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(
    join(root, ".arc", "active", "meta-sample.md"),
    [
      "# Metadata: Sample",
      "",
      "- **State:** Active",
      `- **Branch:** ${branch}`,
      "- **Task List:** `tasks-sample.md`",
      "",
    ].join("\n"),
  );
  return root;
}

function buildSettings(pushInterlock: PushInterlock): ResolvedSettingsResult {
  const settings: ConfigSettings = {
    "inbox.remind_after_days": "1",
    "integration.stale_after_days": "2",
    "branch.base": "main",
    "branch.protection": "partial",
    "worktree.location_template": "../{repo}.{name}",
    "worktree.post_create": "",
    "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
    "commit.format": "conventional",
    "commit.context_footer": "required",
    "commit.custom_pattern": "",
    "commit.context_pattern": "",
    "merge.strategy": "merge",
    "review.pre_merge": "enabled",
    "platform.type": "github",
    "pm.mode": "arc-in-git",
    "team.mode": "false",
    "session.remote_sync": "enabled",
    "session.init_pull.worktree": "prompt",
    "session.init_pull.notes": "prompt",
    "session.init_pull.base": "prompt",
    "session.init_load.notes": "prompt",
    "sync.auto_pull": "false",
    "archive.cadence": "with-integration",
    "user.notes_push": "on-sync",
  };
  return {
    settings,
    resolved: {
      commitInterlock: { value: "manual" satisfies CommitInterlock, source: "default" },
      pushInterlock: { value: pushInterlock, source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      releaseOptedIn: { value: "true", source: "default" },
    },
    defaultsApplied: [],
    warnings: [],
  };
}

function buildGitExec(cwd: string): GitExec {
  return async (cmd, args) => {
    const result = await execFileAsync(cmd, args as string[], { cwd });
    return { stdout: result.stdout, stderr: result.stderr };
  };
}

describe("arc release push — no-upstream auto-resolution (integration)", () => {
  let root: string;
  const BRANCH = "technical/sample";

  beforeEach(async () => { root = await createRepoOnFreshBranch(BRANCH); });
  afterEach(async () => { await removeGitBackedDir(root); });

  it("wrapper-routed push on no-upstream branch + pushInterlock=on-workflow injects -u", async () => {
    const exec = buildGitExec(root);
    const spawnCalls: Array<{ args: readonly string[] }> = [];
    const deps: ReleasePushDeps = {
      cwd: root,
      identity: "alice",
      argv: [],
      settings: buildSettings("on-workflow"),
      currentBranch: BRANCH,
      runPushability: () => runPushabilityStatus({
        exec,
        access,
        target: "worktree",
      }),
      spawnPush: async (opts) => {
        spawnCalls.push({ args: opts.args });
        return { status: "success", stdout: "", stderr: "" };
      },
    };

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(0);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toEqual(["-u"]);
  });

  it("activation rename clears the inherited plan upstream before wrapper-routed push", async () => {
    await execFileAsync("git", ["branch", "-m", BRANCH, "plan/sample"], { cwd: root });
    const origin = join(root, ".git", "test-origin.git");
    await execFileAsync("git", ["init", "--bare", origin]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: origin });
    await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: root });
    await execFileAsync("git", ["push", "-u", "origin", "plan/sample"], { cwd: root });

    const exec = buildGitExec(root);
    await reconcileBranch(
      { exec },
      { mutation: "rename", branch: "plan/sample", toBranch: BRANCH },
    );

    const spawnCalls: Array<{ args: readonly string[] }> = [];
    const deps: ReleasePushDeps = {
      cwd: root,
      identity: "alice",
      argv: [],
      settings: buildSettings("on-workflow"),
      currentBranch: BRANCH,
      runPushability: () => runPushabilityStatus({
        exec,
        access,
        target: "worktree",
      }),
      spawnPush: async (opts) => {
        spawnCalls.push({ args: opts.args });
        return { status: "success", stdout: "", stderr: "" };
      },
    };

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(0);
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toEqual(["-u"]);
  });

  it("wrapper-routed push on no-upstream branch + pushInterlock=manual refuses with code 14", async () => {
    const exec = buildGitExec(root);
    const spawnCalls: Array<{ args: readonly string[] }> = [];
    const deps: ReleasePushDeps = {
      cwd: root,
      identity: "alice",
      argv: [],
      settings: buildSettings("manual"),
      currentBranch: BRANCH,
      runPushability: () => runPushabilityStatus({
        exec,
        access,
        target: "worktree",
      }),
      spawnPush: async (opts) => {
        spawnCalls.push({ args: opts.args });
        return { status: "success", stdout: "", stderr: "" };
      },
      writeStderr: () => {
        /* swallow */
      },
    };

    const result = await runReleasePush(deps);

    expect(result.exitCode).toBe(14);
    expect(spawnCalls).toHaveLength(0);
  });
});
