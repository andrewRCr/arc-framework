import { describe, it, expect } from "vitest";

import {
  analyzeWorktreeSnapshot,
  countAheadBehindRef,
  runWorktreeSyncStatus,
} from "../../../src/lib/git/worktree-sync.js";
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

const REV_PARSE_HEAD = "rev-parse --abbrev-ref HEAD";
const REV_PARSE_UPSTREAM = "rev-parse --abbrev-ref @{upstream}";
const FETCH_BRANCH = "fetch origin *";
const REV_LIST_COUNT = "rev-list --left-right --count *";
const TRACKED_WORKTREE = { remoteSyncEnabled: true, originConfigured: true } as const;

describe("analyzeWorktreeSnapshot", () => {
  it("returns not-applicable before remote evidence when automatic inspection is disabled", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: false,
      originConfigured: true,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "unreachable", failureReason: "network" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "skipped",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "not-applicable",
    });
  });

  it("returns detached-head before inspecting remote evidence", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: true,
      originConfigured: true,
      branch: null,
      upstreamBranch: null,
      snapshot: { kind: "unreachable", failureReason: "auth" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "detached-head",
      ahead: 0,
      behind: 0,
      branch: null,
      remoteEvidence: "not-applicable",
    });
  });

  it("returns no-remote before inspecting branch membership", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: true,
      originConfigured: false,
      branch: "main",
      upstreamBranch: null,
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "no-remote",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "not-applicable",
    });
  });

  it("preserves no-upstream precedence when the snapshot omits the same branch", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: true,
      originConfigured: true,
      branch: "feature/local",
      upstreamBranch: null,
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "no-upstream",
      ahead: 0,
      behind: 0,
      branch: "feature/local",
      remoteEvidence: "not-applicable",
    });
  });

  it("classifies an exact relation against a locally available advertised commit", async () => {
    const localOid = "a".repeat(40);
    const advertisedOid = "b".repeat(40);
    const { exec, calls } = buildExec({
      "rev-parse HEAD": { stdout: localOid, stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t3", stderr: "" },
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "all-heads", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    })).resolves.toEqual({
      state: "remote-ahead",
      ahead: 0,
      behind: 3,
      branch: "main",
      remoteEvidence: "exact",
    });
    expect(calls.at(-1)?.args).toEqual([
      "rev-list",
      "--left-right",
      "--count",
      `${localOid}...${advertisedOid}`,
    ]);
  });

  it("classifies a tracked branch omitted from a complete snapshot as branch-gone", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "feature/gone",
      upstreamBranch: "feature/gone",
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "branch-gone",
      ahead: 0,
      behind: 0,
      branch: "feature/gone",
      remoteEvidence: "exact",
    });
  });

  it("returns pending evidence with neutral counts when the advertised commit is not local", async () => {
    const advertisedOid = "c".repeat(40);
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: false } },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "pending-fetch",
    });
  });

  it.each([
    ["execution", /inspection failed/u],
    ["malformed", /malformed output/u],
  ] as const)("propagates %s object-availability prerequisite failure", async (reason, message) => {
    const advertisedOid = "c".repeat(40);
    const { exec, calls } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "unavailable", reason },
      history: { kind: "complete" },
    })).rejects.toThrow(message);
    expect(calls).toEqual([]);
  });

  it("does not reuse a stale tracking-ref relation when the advertised commit is not local", async () => {
    const advertisedOid = "5".repeat(40);
    const { exec } = buildExec({
      [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" },
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: false } },
      history: { kind: "complete" },
    })).resolves.toEqual({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "pending-fetch",
    });
  });

  it("returns typed unreachable evidence when snapshot acquisition failed", async () => {
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "unreachable", failureReason: "network" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toEqual({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "unreachable",
      failureReason: "network",
    });
  });

  it("preserves exact equality without traversing shallow history", async () => {
    const advertisedOid = "d".repeat(40);
    const { exec } = buildExec({
      "rev-parse HEAD": { stdout: advertisedOid, stderr: "" },
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "shallow" },
    })).resolves.toEqual({
      state: "clean",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "exact",
    });
  });

  it("rejects distance analysis when local history is shallow", async () => {
    const localOid = "e".repeat(40);
    const advertisedOid = "f".repeat(40);
    const { exec } = buildExec({
      "rev-parse HEAD": { stdout: localOid, stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t1", stderr: "" },
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "shallow" },
    })).rejects.toThrow(/Complete local history/u);
  });

  it("uses local-only object access for identity and distance reads", async () => {
    const localOid = "1".repeat(40);
    const advertisedOid = "2".repeat(40);
    const requireLocalOnly: ResponseFn = (args, options) => {
      if (options?.objectAccess !== "local-only") {
        throw new Error(`lazy object access allowed for ${args[0] ?? "git"}`);
      }
      return args[0] === "rev-parse"
        ? { stdout: localOid, stderr: "" }
        : { stdout: "1\t0", stderr: "" };
    };
    const { exec } = buildExec({
      "rev-parse HEAD": requireLocalOnly,
      [REV_LIST_COUNT]: requireLocalOnly,
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({ state: "local-ahead", remoteEvidence: "exact" });
  });

  it.each([
    ["execution failure", () => { throw new Error("graph failed"); }, /graph failed/u],
    ["malformed output", { stdout: "not counts", stderr: "" }, /Malformed git rev-list/u],
  ] as const)("propagates local graph %s", async (_label, graphResponse, expected) => {
    const localOid = "3".repeat(40);
    const advertisedOid = "4".repeat(40);
    const { exec } = buildExec({
      "rev-parse HEAD": { stdout: localOid, stderr: "" },
      [REV_LIST_COUNT]: graphResponse,
    });

    await expect(analyzeWorktreeSnapshot({
      exec,
      ...TRACKED_WORKTREE,
      branch: "main",
      upstreamBranch: "main",
      snapshot: { kind: "available", scope: "exact", tips: { main: advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow(expected);
  });
});

describe("runWorktreeSyncStatus", () => {
  it("short-circuits past upstream/fetch checks but still resolves branch when remoteSyncEnabled is false", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({
      exec,
      remoteSyncEnabled: false,
    });

    expect(result.state).toBe("skipped");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.branch).toBe("main");
    // Branch resolution is the only git call — no fetch, no upstream lookup.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
  });

  it("returns clean with zero counts when local HEAD matches origin/<branch>", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("clean");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.branch).toBe("main");
  });

  it("returns remote-ahead with the correct behind count", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t3", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("remote-ahead");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(3);
  });

  it("degrades to remote-unavailable when the distance read fails after fetch", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: () => {
        throw new Error("fatal: bad revision");
      },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.branch).toBe("main");
  });

  it("returns local-ahead with the correct ahead count", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t0", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("local-ahead");
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(0);
  });

  it("returns diverged with both counts populated when neither side is ancestor", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t3", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("diverged");
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(3);
  });

  it("returns no-upstream without fetching when @{upstream} resolution fails", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feature/x", stderr: "" },
      [REV_PARSE_UPSTREAM]: () => {
        throw new Error("fatal: no upstream configured for branch 'feature/x'");
      },
      "remote get-url origin": { stdout: "git@github.com:owner/repo.git", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("no-upstream");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("returns detached-head without fetching when HEAD is detached", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "HEAD", stderr: "" },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("detached-head");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.branch).toBeNull();
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
    expect(calls.some((c) => c.args.includes("@{upstream}"))).toBe(false);
  });

  it("returns no-remote without fetching when origin is not configured", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: () => {
        throw new Error("fatal: no upstream configured for branch 'main'");
      },
      "remote get-url origin": () => {
        throw new Error("fatal: No such remote 'origin'");
      },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("no-remote");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("returns remote-unavailable with timeout reason when fetch exceeds the bounded timeout", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: (_args, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("canceled"), { isCanceled: true }));
          });
        }),
    });

    const result = await runWorktreeSyncStatus({
      exec,
      remoteSyncEnabled: true,
      fetchTimeoutMs: 25,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("timeout");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("returns remote-unavailable with error reason when fetch fails (non-timeout)", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: () => {
        throw new Error(
          "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        );
      },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("returns branch-gone when fetch fails with a remote-ref-not-found rejection (exit 128)", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/feat/x", stderr: "" },
      [FETCH_BRANCH]: () => {
        throw Object.assign(new Error("fetch failed"), {
          code: 128,
          stderr: "fatal: couldn't find remote ref refs/heads/feat/x",
        });
      },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("branch-gone");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.branch).toBe("feat/x");
    // branch-gone is a distinct state, not a remote-unavailable failure flavor.
    expect(result.failureReason).toBeUndefined();
  });

  it("keeps remote-unavailable (error) for an exit-128 fetch failure that is not ref-not-found", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: () => {
        throw Object.assign(new Error("fetch failed"), {
          code: 128,
          stderr: "fatal: unable to access 'https://...': Could not resolve host: github.com",
        });
      },
    });

    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
  });

  it("classifies as error (not timeout) when a non-AbortError rejection coincides with signal abort", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: (_args, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            // Race-window simulation: signal aborts, but the underlying
            // failure is not AbortError (e.g., DNS, auth prompt closing).
            reject(new Error("fatal: connection refused"));
          });
        }),
    });

    const result = await runWorktreeSyncStatus({
      exec,
      remoteSyncEnabled: true,
      fetchTimeoutMs: 25,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
  });

  it("drives the distance check through HEAD...origin/<branch>", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "1\t1", stderr: "" },
    });

    await runWorktreeSyncStatus({ exec, remoteSyncEnabled: true });

    const revList = calls.find((c) => c.args[0] === "rev-list");
    expect(revList?.args).toContain("HEAD...origin/main");
  });
});

describe("countAheadBehindRef", () => {
  it("computes ahead/behind for an arbitrary local/remote ref pair", async () => {
    const { exec, calls } = buildExec({
      [REV_LIST_COUNT]: { stdout: "4\t1", stderr: "" },
    });

    const result = await countAheadBehindRef(exec, "feature/x", "origin/develop");

    expect(result.ahead).toBe(4);
    expect(result.behind).toBe(1);
    // The ref pair flows straight into the symmetric-difference refspec.
    const revList = calls.find((c) => c.args[0] === "rev-list");
    expect(revList?.args).toContain("feature/x...origin/develop");
  });

  it("classifies parity as clean", async () => {
    const { exec } = buildExec({ [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" } });
    const result = await countAheadBehindRef(exec, "HEAD", "origin/main");
    expect(result.state).toBe("clean");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("classifies remote-only commits as remote-ahead", async () => {
    const { exec } = buildExec({ [REV_LIST_COUNT]: { stdout: "0\t3", stderr: "" } });
    const result = await countAheadBehindRef(exec, "HEAD", "origin/main");
    expect(result.state).toBe("remote-ahead");
  });

  it("classifies local-only commits as local-ahead", async () => {
    const { exec } = buildExec({ [REV_LIST_COUNT]: { stdout: "2\t0", stderr: "" } });
    const result = await countAheadBehindRef(exec, "HEAD", "origin/main");
    expect(result.state).toBe("local-ahead");
  });

  it("classifies commits on both sides as diverged", async () => {
    const { exec } = buildExec({ [REV_LIST_COUNT]: { stdout: "2\t3", stderr: "" } });
    const result = await countAheadBehindRef(exec, "HEAD", "origin/main");
    expect(result.state).toBe("diverged");
  });

  it.each(["", "1", "1 x", "-1 2", "1 2 3", "1.5 2", "9007199254740992 0"])(
    "rejects malformed or unsafe count output %j",
    async (stdout) => {
      const { exec } = buildExec({ [REV_LIST_COUNT]: { stdout, stderr: "" } });
      await expect(countAheadBehindRef(exec, "HEAD", "origin/main")).rejects.toThrow(
        /rev-list --count|safe integer/u,
      );
    },
  );
});
