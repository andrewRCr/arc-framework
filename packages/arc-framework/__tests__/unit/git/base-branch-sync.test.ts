import { describe, it, expect } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  analyzeBaseBranchSnapshot,
  BaseBranchSyncStatusResultSchema,
  BaseCheckoutLocusSchema,
  readLocalBaseOid,
  runBaseBranchSyncStatus,
} from "../../../src/lib/git/base-branch-sync.js";
import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../../src/lib/git/index.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";
import { makeGitProcessError, scriptGitExec, type GitExecCall } from "../../helpers/git-exec-fake.js";

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

/**
 * Script wildcard-keyed Git responses with the shared invocation recorder.
 */
function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): ReturnType<typeof scriptGitExec> {
  return scriptGitExec(Object.entries(responses).map(([key, entry]) => ({
    match: { predicate: (args: readonly string[]) => key.split(" ").every((token, index) =>
      token === "*" || args[index] === token) },
    responses: [typeof entry === "function"
      ? ({ args, options }: GitExecCall) => entry(args, options)
      : entry],
  })));
}

const GET_ORIGIN = "remote get-url origin";
const FETCH_BASE = "fetch origin *";
const REV_LIST_COUNT = "rev-list --left-right --count *";
const WORKTREE_LIST = "worktree list --porcelain -z";
const REV_PARSE_TOP = "rev-parse --show-toplevel";
const BASE_OID = "b".repeat(40);

describe("readLocalBaseOid", () => {
  it("propagates a local base inspection failure", async () => {
    const exec: GitExec = async (command, args) => {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "object database unavailable" });
    };

    await expect(readLocalBaseOid(exec, "main")).rejects.toThrow("object database unavailable");
  });

  it("rejects malformed local base output", async () => {
    const exec: GitExec = async () => ({ stdout: "not-an-object-id\n", stderr: "" });

    await expect(readLocalBaseOid(exec, "main")).rejects.toThrow("valid local base commit");
  });

  it("returns null only for a missing local base ref", async () => {
    const exec: GitExec = async (command, args) => {
      throw makeGitProcessError({ command, args, exitCode: 1 });
    };

    await expect(readLocalBaseOid(exec, "main")).resolves.toBeNull();
  });

  it("reads from the named repository root when one is supplied", async () => {
    // The executor carries no root, so an unbound read resolves against the process
    // directory and can report a different repository's base than the one requested.
    let observed: GitExecOptions | undefined;
    const exec: GitExec = async (_command, _args, options) => {
      observed = options;
      return { stdout: `${"a".repeat(40)}\n`, stderr: "" };
    };

    await readLocalBaseOid(exec, "main", "/repo/root");

    expect(observed).toMatchObject({ cwd: "/repo/root", objectAccess: "local-only" });
  });

  it("passes no directory option when no root is supplied", async () => {
    let observed: GitExecOptions | undefined;
    const exec: GitExec = async (_command, _args, options) => {
      observed = options;
      return { stdout: `${"a".repeat(40)}\n`, stderr: "" };
    };

    await readLocalBaseOid(exec, "main");

    expect(observed).toEqual({ objectAccess: "local-only" });
  });
});

/** Default topology: current worktree on feat; base (main) not checked out. */
const NOT_CHECKED_OUT = {
  [WORKTREE_LIST]: {
    stdout: worktreePorcelainZ("worktree /repo\nHEAD abc\nbranch refs/heads/feat\n\n"),
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/repo\n", stderr: "" },
};

/** Primary holds main; current session is the linked feat worktree. */
const BASE_ELSEWHERE_PRIMARY = {
  [WORKTREE_LIST]: {
    stdout: worktreePorcelainZ(
      "worktree /primary\nHEAD aaa\nbranch refs/heads/main\n\n"
      + "worktree /linked\nHEAD bbb\nbranch refs/heads/feat\n\n",
    ),
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/linked\n", stderr: "" },
};

/** Current worktree holds main (primary). */
const BASE_CURRENT_PRIMARY = {
  [WORKTREE_LIST]: {
    stdout: worktreePorcelainZ("worktree /primary\nHEAD aaa\nbranch refs/heads/main\n\n"),
    stderr: "",
  },
  [REV_PARSE_TOP]: { stdout: "/primary\n", stderr: "" },
};

describe("snapshot-driven base-branch sync", () => {
  it("reports equal local and advertised OIDs as exact without graph traversal", async () => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: BASE_OID,
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "shallow" },
    })).resolves.toMatchObject({
      state: "clean",
      ahead: 0,
      behind: 0,
      base: "main",
      remoteEvidence: "exact",
      refreshRemedy: null,
    });
    expect(calls).toEqual([]);
  });

  it("reports a differing advertised OID that is not local as pending", async () => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: "a".repeat(40),
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: false } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      unavailableReason: "base-object-pending-fetch",
      remoteEvidence: "pending-fetch",
      refreshRemedy: { argv: ["arc", "base", "sync", "--json"] },
    });
    expect(calls).toEqual([]);
  });

  it.each([
    ["execution", /inspection failed/u],
    ["malformed", /malformed output/u],
  ] as const)("propagates %s object-availability prerequisite failure", async (reason, message) => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: "a".repeat(40),
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "unavailable", reason },
      history: { kind: "complete" },
    })).rejects.toThrow(message);
    expect(calls).toEqual([]);
  });

  it("reports exact local-base absence with an explicit base-sync remedy", async () => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: null,
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      unavailableReason: "local-base-absent",
      remoteEvidence: "exact",
      refreshRemedy: {
        text: expect.stringContaining("local main"),
        argv: ["arc", "base", "sync", "--json"],
      },
    });
    expect(calls).toEqual([]);
  });

  it("reports exact remote-base absence with configuration guidance and no remedy", async () => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: BASE_OID,
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    })).resolves.toMatchObject({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      unavailableReason: "remote-base-absent",
      remoteEvidence: "exact",
      refreshRemedy: null,
      guidance: expect.stringMatching(/configured base.*main.*origin/iu),
    });
    expect(calls).toEqual([]);
  });

  it("reports exact graph distance against a locally available advertised OID", async () => {
    const localOid = "a".repeat(40);
    const { exec } = buildExec({
      [REV_LIST_COUNT]: (_args, options) => {
        if (options?.objectAccess !== "local-only") throw new Error("lazy object access allowed");
        return { stdout: "0\t3", stderr: "" };
      },
    });

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: localOid,
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      state: "remote-ahead",
      ahead: 0,
      behind: 3,
      remoteEvidence: "exact",
      refreshRemedy: null,
    });
  });

  it("rejects graph distance when local history is shallow", async () => {
    const { exec } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: "a".repeat(40),
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "shallow" },
    })).rejects.toThrow(/Complete local history/u);
  });

  it.each([
    ["execution failure", (args: string[]) => {
      throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "distance failed" });
    }, /distance failed/u],
    ["malformed output", { stdout: "not counts", stderr: "" }, /Malformed git rev-list/u],
  ] as const)("propagates local distance %s", async (_label, response, expected) => {
    const { exec } = buildExec({ [REV_LIST_COUNT]: response });

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: "a".repeat(40),
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "available", scope: "exact", tips: { main: BASE_OID } },
      objectAvailability: { kind: "complete", commits: { [BASE_OID]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow(expected);
  });

  it("preserves typed unreachable evidence without running local Git", async () => {
    const { exec, calls } = buildExec({});

    await expect(analyzeBaseBranchSnapshot({
      exec,
      baseBranch: "main",
      localBaseOid: BASE_OID,
      checkout: { kind: "not-checked-out" },
      snapshot: { kind: "unreachable", failureReason: "auth" },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    })).resolves.toMatchObject({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      remoteEvidence: "unreachable",
      failureReason: "auth",
      refreshRemedy: null,
    });
    expect(calls).toEqual([]);
  });
});

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
      [GET_ORIGIN]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: No such remote 'origin'" });
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
      [FETCH_BASE]: (args, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(makeGitProcessError({ command: "git", args, isCanceled: true, stderr: "canceled" }));
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
    if (result.state === "remote-unavailable") expect(result.failureReason).toBe("timeout");
  });

  it("degrades to remote-unavailable (error) when the base fetch fails", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: (args) => {
        throw makeGitProcessError({ command: "git", args,
          exitCode: 128,
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
    if (result.state === "remote-unavailable") expect(result.failureReason).toBe("error");
  });

  it("degrades to remote-unavailable (error) when the local base ref does not exist", async () => {
    // A fresh clone on a feature branch may never have materialized local
    // `<base>`; the distance read throws on the unknown ref.
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: bad revision 'main...origin/main'" });
      },
    });

    const result = await runBaseBranchSyncStatus({
      exec,
      baseBranch: "main",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-unavailable");
    if (result.state === "remote-unavailable") expect(result.failureReason).toBe("error");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.base).toBe("main");
  });

  it("propagates producer-schema defects instead of reporting a git-read failure", async () => {
    const { exec } = buildExec({
      ...NOT_CHECKED_OUT,
      [GET_ORIGIN]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      [FETCH_BASE]: { stdout: "", stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t0", stderr: "" },
    });

    await expect(runBaseBranchSyncStatus({
      exec,
      baseBranch: "",
      remoteSyncEnabled: true,
    })).rejects.toThrow("base branch must not be empty");
  });

  it("reports checkout unknown when worktree list fails", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: not a git repository" });
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

describe("BaseBranchSyncStatusResultSchema", () => {
  const base = { base: "main", checkout: { kind: "not-checked-out" } as const };

  it.each([
    { state: "clean", ahead: 0, behind: 0 },
    { state: "remote-ahead", ahead: 0, behind: 2 },
    { state: "local-ahead", ahead: 2, behind: 0 },
    { state: "diverged", ahead: 2, behind: 3 },
    { state: "skipped", ahead: 0, behind: 0 },
    { state: "no-remote", ahead: 0, behind: 0 },
    { state: "remote-unavailable", ahead: 0, behind: 0, failureReason: "timeout" },
  ])("accepts producer state $state", (state) => {
    assertSchemaAccepts(BaseBranchSyncStatusResultSchema, { ...base, ...state });
  });

  it.each([
    { kind: "not-checked-out" },
    { kind: "current", path: "/repo", primary: true },
    { kind: "elsewhere", path: "/primary", primary: false },
    { kind: "unknown" },
  ])("accepts checkout locus $kind", (checkout) => {
    assertSchemaAccepts(BaseCheckoutLocusSchema, checkout);
  });

  it.each([
    { state: "clean", ahead: 1, behind: 0 },
    { state: "remote-ahead", ahead: 0, behind: 0 },
    { state: "local-ahead", ahead: 0, behind: 0 },
    { state: "diverged", ahead: 1, behind: 0 },
    { state: "skipped", ahead: 0, behind: 1 },
    { state: "remote-unavailable", ahead: 0, behind: 0 },
    { state: "clean", ahead: 0, behind: 0, failureReason: "error" },
    { state: "detached-head", ahead: 0, behind: 0 },
  ])("rejects inconsistent state fields", (state) => {
    assertSchemaRefuses(BaseBranchSyncStatusResultSchema, { ...base, ...state });
  });

  it.each([
    { kind: "not-checked-out", path: "/repo" },
    { kind: "current", path: "", primary: true },
    { kind: "elsewhere", path: "/repo" },
    { kind: "unknown", primary: false },
  ])("rejects invalid checkout fields", (checkout) => {
    assertSchemaRefuses(BaseCheckoutLocusSchema, checkout);
  });
});
