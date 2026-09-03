import { describe, expect, it, vi } from "vitest";

import {
  pushWorktreeBranch,
  type PushWorktreeSpawn,
} from "../../../src/lib/git/push-worktree.js";
import type { GitExec } from "../../../src/lib/git/index.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";

describe("pushWorktreeBranch — capture mode (default)", () => {
  it("pushes to an explicitly selected remote", async () => {
    const exec: GitExec = vi.fn(async (_command, args) => {
      if (args[1] !== "upstream") throw new Error("wrong remote");
      return { stdout: "pushed upstream\n", stderr: "" };
    });

    const result = await pushWorktreeBranch({
      exec,
      branch: "feature/x",
      remote: "upstream",
    });

    expect(result).toEqual({
      status: "success",
      stdout: "pushed upstream\n",
      stderr: "",
    });
  });

  it("invokes `git push origin <branch>` and reports success with captured streams", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const result = await pushWorktreeBranch({ exec, branch: "feature/x" });

    expect(result).toEqual({ status: "success", stdout: "", stderr: "" });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("git", ["push", "origin", "feature/x"]);
  });

  it("returns the captured stdout and stderr from the executor on success", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({
      stdout: "everything up-to-date\n",
      stderr: "remote: feedback\n",
    });

    const result = await pushWorktreeBranch({ exec, branch: "main" });

    expect(result).toMatchObject({
      status: "success",
      stdout: "everything up-to-date\n",
      stderr: "remote: feedback\n",
    });
  });

  it("captures executor errors and reports failed with the original Error preserved", async () => {
    const cause = new Error("error: failed to push some refs to 'origin'");
    const exec: GitExec = vi.fn().mockRejectedValue(cause);

    const result = await pushWorktreeBranch({ exec, branch: "main" });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBe(cause);
    }
  });

  it("normalizes non-Error throws to Error instances", async () => {
    const exec: GitExec = vi.fn().mockRejectedValue("network unreachable");

    const result = await pushWorktreeBranch({ exec, branch: "main" });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("network unreachable");
    }
  });

  it("surfaces stdout/stderr fields off rejected exec errors when present", async () => {
    const cause = Object.assign(new Error("git push exited 1"), {
      stdout: "out\n",
      stderr: " ! [rejected] feature/x -> feature/x (fetch first)\n",
    });
    const exec: GitExec = vi.fn().mockRejectedValue(cause);

    const result = await pushWorktreeBranch({ exec, branch: "feature/x" });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.stdout).toBe("out\n");
      expect(result.stderr).toContain("rejected");
    }
  });
});

describe("pushWorktreeBranch — args passthrough", () => {
  it("appends a single arg after `origin <branch>`", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    await pushWorktreeBranch({
      exec,
      branch: "main",
      args: ["--force-with-lease"],
    });

    expect(exec).toHaveBeenCalledWith("git", [
      "push", "origin", "main", "--force-with-lease",
    ]);
  });

  it("preserves order across multiple args", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    await pushWorktreeBranch({
      exec,
      branch: "main",
      args: ["--force-with-lease", "--no-verify"],
    });

    expect(exec).toHaveBeenCalledWith("git", [
      "push", "origin", "main", "--force-with-lease", "--no-verify",
    ]);
  });

  it("treats omitted args as no extra args (existing call-site behavior)", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    await pushWorktreeBranch({ exec, branch: "main" });

    expect(exec).toHaveBeenCalledWith("git", ["push", "origin", "main"]);
  });

  it("forwards args through to spawnPush under inheritStdio: true", async () => {
    const spawnPush: PushWorktreeSpawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: "",
    });

    await pushWorktreeBranch({
      exec: vi.fn(),
      branch: "feature/x",
      args: ["--force-with-lease"],
      inheritStdio: true,
      spawnPush,
    });

    expect(spawnPush).toHaveBeenCalledWith({
      branch: "feature/x",
      remote: "origin",
      args: ["--force-with-lease"],
    });
  });
});

describe("pushWorktreeBranch — inheritStdio: true (spawn mode)", () => {
  it("forwards an explicitly selected remote to the spawn boundary", async () => {
    const spawnPush: PushWorktreeSpawn = vi.fn(async ({ remote }) => ({
      exitCode: remote === "upstream" ? 0 : 1,
      stderr: "",
    }));

    const result = await pushWorktreeBranch({
      exec: vi.fn(),
      branch: "feature/x",
      remote: "upstream",
      inheritStdio: true,
      spawnPush,
    });

    expect(result.status).toBe("success");
  });

  it("delegates to spawnPush and never calls exec", async () => {
    const exec: GitExec = vi.fn();
    const spawnPush: PushWorktreeSpawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: "",
    });

    await pushWorktreeBranch({
      exec,
      branch: "main",
      inheritStdio: true,
      spawnPush,
    });

    expect(exec).not.toHaveBeenCalled();
    expect(spawnPush).toHaveBeenCalledTimes(1);
  });

  it("returns success with empty stdout and captured stderr on exit code 0", async () => {
    const spawnPush: PushWorktreeSpawn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stderr: "  feature/x -> feature/x\n",
    });

    const result = await pushWorktreeBranch({
      exec: vi.fn(),
      branch: "feature/x",
      inheritStdio: true,
      spawnPush,
    });

    expect(result).toEqual({
      status: "success",
      stdout: "",
      stderr: "  feature/x -> feature/x\n",
    });
  });

  it("returns failed with captured stderr on non-zero exit code", async () => {
    const spawnPush: PushWorktreeSpawn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stderr: " ! [rejected] feature/x -> feature/x (non-fast-forward)\n",
    });

    const result = await pushWorktreeBranch({
      exec: vi.fn(),
      branch: "feature/x",
      inheritStdio: true,
      spawnPush,
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("rejected");
      expect(result.error.message).toContain("1");
    }
  });

  it("preserves normalized non-zero evidence supplied by the production adapter", async () => {
    const error = new GitProcessError({
      kind: "nonzero-exit",
      command: "git",
      args: ["push", "origin", "feature/x"],
      exitCode: 7,
      stderr: "rejected\n",
    });
    const spawnPush: PushWorktreeSpawn = vi.fn().mockResolvedValue({
      exitCode: 7,
      stderr: "rejected\n",
      error,
    });

    const result = await pushWorktreeBranch({
      exec: vi.fn(),
      branch: "feature/x",
      inheritStdio: true,
      spawnPush,
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.error).toBe(error);
  });
});
