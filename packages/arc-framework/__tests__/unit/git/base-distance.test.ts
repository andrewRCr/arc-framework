import { describe, it, expect } from "vitest";

import { runBaseDistanceStatus } from "../../../src/lib/git/base-distance.js";
import { classifyPathSurface } from "../../../src/lib/git/write-context.js";
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
const GET_ORIGIN = "remote get-url origin";
const FETCH_BASE = "fetch origin *";
const REV_LIST_COUNT = "rev-list --left-right --count *";
const MERGE_BASE = "merge-base HEAD *";
const DIFF_BRANCH = "diff --name-only * HEAD";
const DIFF_BASE = "diff --name-only * origin/main";

describe("runBaseDistanceStatus", () => {
  it("short-circuits to skipped without any git call when remote sync is disabled", async () => {
    const { exec, calls } = buildExec({});

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: false,
    });

    expect(result.state).toBe("skipped");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.base).toBe("main");
    expect(calls).toHaveLength(0);
  });

  it("reports remote-ahead with the behind-base distance when the base moved under the branch", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t4", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(4);
    expect(result.base).toBe("main");
    // Distance is measured HEAD vs origin/<base>, not the branch's own upstream.
    const revList = calls.find((c) => c.args[0] === "rev-list");
    expect(revList?.args).toContain("HEAD...origin/main");
    // The base ref is fetched (not the current branch).
    const fetch = calls.find((c) => c.args[0] === "fetch");
    expect(fetch?.args).toEqual(["fetch", "origin", "main"]);
  });

  it("reports clean at parity with the base", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("reports local-ahead when the branch carries commits the base does not", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "3\t0", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("local-ahead");
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(0);
  });

  it("reports diverged when both the branch and the base have unique commits", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
      [MERGE_BASE]: { stdout: "abc123\n", stderr: "" },
      [DIFF_BRANCH]: { stdout: "src/a.ts\n", stderr: "" },
      [DIFF_BASE]: { stdout: "src/b.ts\n", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("diverged");
    expect(result.ahead).toBe(2);
    expect(result.behind).toBe(5);
  });

  it("flags paths changed on both the branch and the base side when diverged", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
      [MERGE_BASE]: { stdout: "abc123\n", stderr: "" },
      [DIFF_BRANCH]: { stdout: "src/a.ts\nsrc/shared.ts\n", stderr: "" },
      [DIFF_BASE]: { stdout: "src/shared.ts\nsrc/c.ts\n", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.overlappingPaths).toEqual(["src/shared.ts"]);
  });

  it("reports no overlap when the diverged changed-path sets are disjoint", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
      [MERGE_BASE]: { stdout: "abc123\n", stderr: "" },
      [DIFF_BRANCH]: { stdout: "src/a.ts\n", stderr: "" },
      [DIFF_BASE]: { stdout: "src/b.ts\n", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.overlappingPaths).toEqual([]);
  });

  it("skips the overlap read when the base moved but the branch is a pure fast-forward behind", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t4", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.overlappingPaths).toEqual([]);
    // No merge-base / diff calls — overlap is meaningless without branch-side commits.
    expect(calls.some((c) => c.args[0] === "merge-base")).toBe(false);
    expect(calls.some((c) => c.args[0] === "diff")).toBe(false);
  });

  it("degrades overlap to empty when the merge-base read fails, keeping the distance", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
      [MERGE_BASE]: () => {
        throw new Error("fatal: no merge base");
      },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("diverged");
    expect(result.overlappingPaths).toEqual([]);
  });

  it("degrades to detached-head without fetching when HEAD is detached", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "HEAD", stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("detached-head");
    expect(result.base).toBeNull();
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("degrades to no-remote without fetching when origin is not configured", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: () => {
        throw new Error("fatal: No such remote 'origin'");
      },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("no-remote");
    expect(result.base).toBe("main");
    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("degrades to remote-unavailable (timeout) when the base fetch exceeds the bounded timeout", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
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

    const result = await runBaseDistanceStatus({
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
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: () => {
        throw Object.assign(new Error("fetch failed"), {
          code: 128,
          stderr: "fatal: couldn't find remote ref refs/heads/main",
        });
      },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.failureReason).toBe("error");
  });
});

describe("cohort-doc coverage — behind-base net, not the single-owner gate", () => {
  // A cohort doc is the deliberate multi-owner exception: no single owning WU,
  // so the single-owner foreign-write gate is ill-defined for it. The
  // behind-base overlap is the net that covers it instead. This locks both
  // halves of that routing decision.
  const COHORT_DOC = ".arc/active/cohort-agile-parallelism.md";

  it("surfaces a cohort doc both sides touched as a behind-base overlap", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "2\t5", stderr: "" },
      [MERGE_BASE]: { stdout: "abc123\n", stderr: "" },
      [DIFF_BRANCH]: { stdout: `${COHORT_DOC}\nsrc/a.ts\n`, stderr: "" },
      [DIFF_BASE]: { stdout: `${COHORT_DOC}\nsrc/c.ts\n`, stderr: "" },
    });

    const result = await runBaseDistanceStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.overlappingPaths).toContain(COHORT_DOC);
  });

  it("classifies a cohort doc off the work-unit surface, so the single-owner gate skips it", () => {
    // `cohort-doc`, not `work-unit` — the foreign-write backstop's candidate
    // filter keeps only `work-unit`, so a cohort-doc write never reaches it.
    expect(classifyPathSurface(COHORT_DOC)).toBe("cohort-doc");
  });
});
