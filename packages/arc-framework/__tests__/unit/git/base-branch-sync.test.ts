import { describe, it, expect } from "vitest";

import { runBaseBranchSyncStatus } from "../../../src/lib/git/base-branch-sync.js";
import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../../src/lib/git/index.js";

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

/**
 * Build a GitExec mock keyed off the first argument and an optional second-arg
 * matcher. Returns `{ exec, calls }` so tests can assert recorded invocations.
 */
function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args });
    const key = matchKey(args, responses);
    if (key === null) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`matched key '${key}' has no response`);
    }
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

function matchKey(
  args: string[],
  responses: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(responses)) {
    const tokens = key.split(" ");
    if (tokens.every((token, i) => token === "*" || args[i] === token)) {
      return key;
    }
  }
  return null;
}

const GET_ORIGIN = "remote get-url origin";
const FETCH_BASE = "fetch origin *";
const REV_LIST_COUNT = "rev-list --left-right --count *";
const WORKTREE_LIST = "worktree list --porcelain";
const REV_PARSE_TOP = "rev-parse --show-toplevel";

/** Default topology: current worktree on feat; base (main) not checked out. */
const NOT_CHECKED_OUT = {
  [WORKTREE_LIST]: {
    stdout: "worktree /repo\nHEAD abc\nbranch refs/heads/feat\n\n",
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/repo\n", stderr: "" },
};

/** Primary holds main; current session is the linked feat worktree. */
const BASE_ELSEWHERE_PRIMARY = {
  [WORKTREE_LIST]: {
    stdout:
      "worktree /primary\nHEAD aaa\nbranch refs/heads/main\n\n"
      + "worktree /linked\nHEAD bbb\nbranch refs/heads/feat\n\n",
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/linked\n", stderr: "" },
};

/** Current worktree holds main (primary). */
const BASE_CURRENT_PRIMARY = {
  [WORKTREE_LIST]: {
    stdout: "worktree /primary\nHEAD aaa\nbranch refs/heads/main\n\n",
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/primary\n", stderr: "" },
};

describe("runBaseBranchSyncStatus", () => {
  it("short-circuits to skipped without any git call when remote sync is disabled", async () => {
    const { exec, calls } = buildExec({});

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: false,
    });

    expect(result.state).toBe("skipped");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.base).toBe("main");
    expect(result.checkout).toEqual({ kind: "not-checked-out" });
    expect(calls).toHaveLength(0);
  });

  it("reports clean at parity between the local base and its remote", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.checkout).toEqual({ kind: "not-checked-out" });
  });

  it("reports remote-ahead with the behind distance when the local base is stale and fast-forwardable", async () => {
    const { exec, calls } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t4", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(4);
    expect(result.base).toBe("main");
    expect(result.checkout).toEqual({ kind: "not-checked-out" });
    // Distance is measured local <base> vs origin/<base> — not HEAD vs origin/<base>.
    const revList = calls.find((c) => c.args[0] === "rev-list");
    expect(revList?.args).toContain("main...origin/main");
    // The base ref is fetched.
    const fetch = calls.find((c) => c.args[0] === "fetch");
    expect(fetch?.args).toEqual(["fetch", "origin", "main"]);
  });

  it("reports checkout elsewhere when primary holds the base and the session is linked", async () => {
    const { exec } = buildExec({
      ...BASE_ELSEWHERE_PRIMARY,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t2", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.checkout).toEqual({
      kind: "elsewhere",
      path: "/primary",
      primary: true,
    });
  });

  it("reports checkout current when this worktree holds the base", async () => {
    const { exec } = buildExec({
      ...BASE_CURRENT_PRIMARY,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t1", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.checkout).toEqual({
      kind: "current",
      path: "/primary",
      primary: true,
    });
  });

  it("reports local-ahead when the local base carries commits the remote does not", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t0", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("local-ahead");
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(0);
  });

  it("reports diverged when the local base and the remote both carry unique commits", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("diverged");
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(5);
  });

  it("resolves against a non-default base branch name", async () => {
    const { exec, calls } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t1", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "develop",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.base).toBe("develop");
    const revList = calls.find((c) => c.args[0] === "rev-list");
    expect(revList?.args).toContain("develop...origin/develop");
  });

  it("degrades to no-remote without fetching when origin is not configured", async () => {
    const { exec, calls } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: () => {
        throw new Error("fatal: No such remote 'origin'");
      },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("no-remote");
    expect(result.base).toBe("main");
    expect(result.checkout).toEqual({ kind: "not-checked-out" });
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("degrades to remote-unavailable (timeout) when the base fetch exceeds the bounded timeout", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: (_args, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
          });
        }),
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
      fetchTimeoutMs: 25,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("timeout");
  });

  it("degrades to remote-unavailable (error) when the base fetch fails", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: () => {
        throw Object.assign(new Error("fetch failed"), {
          code: 128,
          stderr: "fatal: couldn't find remote ref refs/heads/main",
        });
      },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
  });

  it("degrades to remote-unavailable (error) when the local base ref does not exist", async () => {
    // A fresh clone on a feature branch may never have materialized local
    // `<base>`; the distance read throws on the unknown ref.
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: () => {
        throw new Error("fatal: bad revision 'main...origin/main'");
      },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.base).toBe("main");
  });

  it("reports checkout unknown when worktree list fails", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: () => {
        throw new Error("fatal: not a git repository");
      },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t1", stderr: "" },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.checkout).toEqual({ kind: "unknown" });
    expect(result.state).toBe("remote-ahead");
  });
});
