/** Invocation-bound Git policy coverage for the release-push Commander adapter. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../src/lib/git/exec.js";
import type { InteractionContext } from "../../../../src/lib/command-input/interaction-context.js";

const mocks = vi.hoisted(() => ({
  ambientExec: vi.fn(),
  boundExec: vi.fn(),
  createGitExec: vi.fn(),
  pushWorktreeBranch: vi.fn(),
  resolveAllSettings: vi.fn(),
  resolveCurrentBranchName: vi.fn(),
  resolveUserIdentity: vi.fn(),
  runPushabilityStatus: vi.fn(),
  runReleasePush: vi.fn(),
  runWorktreeSyncStatus: vi.fn(),
}));

vi.mock("../../../../src/lib/io-context.js", () => ({
  createGitExec: mocks.createGitExec,
  gitExec: mocks.ambientExec,
}));
vi.mock("../../../../src/lib/config/resolved-settings.js", () => ({
  resolveAllSettings: mocks.resolveAllSettings,
}));
vi.mock("../../../../src/lib/paths.js", () => ({
  resolveArcRoot: () => "/repo",
}));
vi.mock("../../../../src/lib/git/index.js", () => ({
  runPushabilityStatus: mocks.runPushabilityStatus,
  runWorktreeSyncStatus: mocks.runWorktreeSyncStatus,
}));
vi.mock("../../../../src/lib/git/push-worktree.js", () => ({
  pushWorktreeBranch: mocks.pushWorktreeBranch,
}));
vi.mock("../../../../src/handlers/shared.js", () => ({
  ARC_PROJECT_ROOT_ERROR: "not an ARC project",
  resolveCurrentBranchName: mocks.resolveCurrentBranchName,
  resolveUserIdentity: mocks.resolveUserIdentity,
}));
vi.mock("../../../../src/handlers/release/push.js", () => ({
  runReleasePush: mocks.runReleasePush,
}));

import { handleReleasePush } from "../../../../src/handlers/release/push-cli.js";

const context: InteractionContext = {
  interaction: "forbidden",
  terminal: "non-interactive",
  confirmation: "ask",
  machineReadable: false,
  promptInput: process.stdin,
  promptOutput: process.stdout,
  subprocess: {
    terminalPrompts: "forbidden",
    presenters: "forbidden",
    ambientStdin: "closed",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
  mocks.ambientExec.mockRejectedValue(new Error("ambient Git executor used"));
  mocks.boundExec.mockResolvedValue({ stdout: "", stderr: "" });
  mocks.createGitExec.mockReturnValue(mocks.boundExec as GitExec);
  mocks.resolveUserIdentity.mockResolvedValue("andrew");
  mocks.resolveAllSettings.mockImplementation(async (input: { exec: GitExec }) => {
    await input.exec("git", ["config", "--get", "arc.releaseOptedIn"]);
    return {
      settings: { "session.remote_sync": "enabled" },
      resolved: {},
      defaultsApplied: [],
      warnings: [],
    };
  });
  mocks.resolveCurrentBranchName.mockImplementation(async (exec: GitExec) => {
    await exec("git", ["branch", "--show-current"]);
    return "feat/test";
  });
  mocks.runWorktreeSyncStatus.mockImplementation(async (input: { exec: GitExec }) => {
    await input.exec("git", ["fetch", "origin", "feat/test"]);
    return { state: "local-ahead", ahead: 1, behind: 0, branch: "feat/test" };
  });
  mocks.runPushabilityStatus.mockImplementation(async (input: { exec: GitExec }) => {
    await input.exec("git", ["rev-parse", "--git-path", "rebase-merge"]);
    return { allowed: true, conditions: [] };
  });
  mocks.pushWorktreeBranch.mockResolvedValue({
    status: "success",
    stdout: "",
    stderr: "",
  });
  mocks.runReleasePush.mockImplementation(async (input: {
    runPushability(): Promise<unknown>;
    spawnPush(options: { branch: string; args: readonly string[]; cwd: string }): Promise<unknown>;
  }) => {
    await input.runPushability();
    await input.spawnPush({ branch: "feat/test", args: [], cwd: "/repo" });
    return { exitCode: 0 };
  });
});

describe("handleReleasePush", () => {
  it("uses one invocation-bound subprocess policy across preflights and the final push", async () => {
    await expect(handleReleasePush({ args: [] }, context)).resolves.toBeUndefined();

    expect(mocks.createGitExec).toHaveBeenCalledWith(context.subprocess);
    expect(mocks.ambientExec).not.toHaveBeenCalled();
    expect(mocks.boundExec).toHaveBeenCalledWith("git", ["fetch", "origin", "feat/test"]);
    expect(mocks.pushWorktreeBranch).toHaveBeenCalledWith({
      exec: mocks.boundExec,
      branch: "feat/test",
      args: [],
      cwd: "/repo",
      inheritStdio: true,
      interaction: context.subprocess,
    });
    expect(process.exitCode).toBeUndefined();
  });
});
