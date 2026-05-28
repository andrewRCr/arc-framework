import { describe, it, expect } from "vitest";

import { runWorktreeSyncStatus } from "../../../src/lib/git/worktree-sync.js";
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
            const err = new Error("AbortError");
            err.name = "AbortError";
            reject(err);
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
});
