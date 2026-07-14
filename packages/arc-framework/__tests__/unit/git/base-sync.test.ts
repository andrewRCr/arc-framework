import { describe, expect, it } from "vitest";

import { syncLocalBase } from "../../../src/lib/git/base-sync.js";

import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

interface RepoState {
  base?: string;
  local: string | null;
  remote: string;
  distance?: string;
  baseWorktree?: string;
  dirty?: boolean;
  fetchFails?: boolean;
  worktreeListFails?: boolean;
  moveAfterStatus?: string;
  ambiguousShortName?: boolean;
}

function fakeRepo(initial: RepoState): { exec: GitExec; currentBase: () => string | null } {
  const state = { ...initial };
  const base = state.base ?? "main";
  let localReads = 0;
  const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });

  const exec: GitExec = async (_cmd, args) => {
    if (args[0] === "remote") return ok("test://origin");
    if (args[0] === "fetch") {
      if (state.fetchFails) throw new Error("fetch failed");
      return ok();
    }
    if (
      args[0] === "rev-parse"
      && (args[2] === `origin/${base}` || args[2] === `refs/remotes/origin/${base}`)
    ) return ok(state.remote);
    if (args[0] === "rev-parse" && (args[2] === base || args[2] === `refs/heads/${base}`)) {
      if (args[2] === base && state.ambiguousShortName) throw new Error("ambiguous refname");
      localReads += 1;
      if (localReads > 1 && state.moveAfterStatus !== undefined) state.local = state.moveAfterStatus;
      if (state.local === null) throw new Error("missing local base");
      return ok(state.local);
    }
    if (args[0] === "rev-list") return ok(state.distance ?? "0 1");
    if (args[0] === "worktree") {
      if (state.worktreeListFails) throw new Error("worktree list failed");
      const roster = state.baseWorktree === undefined
        ? ""
        : `worktree ${state.baseWorktree}\nHEAD ${state.local ?? state.remote}\nbranch refs/heads/${base}\n`;
      return ok(roster);
    }
    if (args[0] === "status") return ok(state.dirty ? "?? local.txt\0" : "");
    if (args[0] === "merge") {
      state.local = state.remote;
      return ok();
    }
    if (args[0] === "branch") {
      state.local = state.remote;
      return ok();
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  };

  return { exec, currentBase: () => state.local };
}

describe("syncLocalBase", () => {
  it("reports an already-current base without inspecting worktrees", async () => {
    const repo = fakeRepo({ local: "same", remote: "same", worktreeListFails: true });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "unchanged", base: "main", at: "same" });
    expect(repo.currentBase()).toBe("same");
  });

  it("refuses a local-ahead base without moving it", async () => {
    const repo = fakeRepo({ local: "local", remote: "remote", distance: "2 0" });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "refused", reason: "local-ahead", base: "main" });
    expect(repo.currentBase()).toBe("local");
  });

  it("refuses a diverged base without moving it", async () => {
    const repo = fakeRepo({ local: "local", remote: "remote", distance: "2 3" });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "refused", reason: "diverged", base: "main" });
    expect(repo.currentBase()).toBe("local");
  });

  it("refuses when worktree state cannot be proven before a ref update", async () => {
    const repo = fakeRepo({ local: "local", remote: "remote", worktreeListFails: true });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "refused", reason: "worktree-list-failed", base: "main" });
    expect(repo.currentBase()).toBe("local");
  });

  it("creates a missing, non-checked-out local base at the remote head", async () => {
    const repo = fakeRepo({ local: null, remote: "remote" });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({
      status: "updated",
      method: "direct-ref",
      base: "main",
      from: null,
      to: "remote",
      worktreePath: null,
    });
    expect(repo.currentBase()).toBe("remote");
  });

  it("honors a configured non-default base branch", async () => {
    const repo = fakeRepo({ base: "develop", local: "local", remote: "remote" });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "develop" });

    expect(result).toMatchObject({ status: "updated", base: "develop", to: "remote" });
    expect(repo.currentBase()).toBe("remote");
  });

  it("resolves the local base unambiguously when a tag has the same name", async () => {
    const repo = fakeRepo({
      local: "local",
      remote: "remote",
      ambiguousShortName: true,
    });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toMatchObject({
      status: "updated",
      base: "main",
      from: "local",
      to: "remote",
    });
    expect(repo.currentBase()).toBe("remote");
  });

  it("refuses when the checked-out base moves after its cleanliness check", async () => {
    const repo = fakeRepo({
      local: "local",
      remote: "remote",
      baseWorktree: "/repo",
      moveAfterStatus: "concurrent",
    });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "refused", reason: "base-moved", base: "main" });
    expect(repo.currentBase()).toBe("concurrent");
  });

  it("reports fetch failures without inspecting or moving the local base", async () => {
    const repo = fakeRepo({ local: "local", remote: "remote", fetchFails: true });

    const result = await syncLocalBase({ exec: repo.exec, baseBranch: "main" });

    expect(result).toEqual({ status: "refused", reason: "fetch-failed", base: "main" });
    expect(repo.currentBase()).toBe("local");
  });
});
