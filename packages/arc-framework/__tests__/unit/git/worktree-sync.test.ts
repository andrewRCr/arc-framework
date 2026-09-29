import { describe, it, expect } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  analyzeWorktreeSnapshot,
  countAheadBehindRef,
  readConfiguredUpstreamBranch,
  runMaterializingWorktreeInspection,
  runPassiveWorktreeInspection,
  runWorktreeSyncStatus,
  WorktreeSyncStatusResultSchema,
  WorktreeSnapshotAnalysisResultSchema,
} from "../../../src/lib/git/worktree-sync.js";
import type {
  ExecResult,
  GitExec,
  GitExecInput,
  GitExecOptions,
} from "../../../src/lib/git/index.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

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
): { exec: GitExec; calls: Array<{ cmd: string; args: string[]; options?: GitExecOptions }> } {
  const calls: Array<{ cmd: string; args: string[]; options?: GitExecOptions }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args, ...(options === undefined ? {} : { options }) });
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

const snapshotRemoteOid = "b".repeat(40);
const snapshotLocalOid = "a".repeat(40);
const snapshotBase = {
  ...TRACKED_WORKTREE,
  branch: "main",
  upstreamBranch: "main",
  snapshot: { kind: "available", scope: "exact", tips: { main: snapshotRemoteOid } },
  objectAvailability: { kind: "complete", commits: { [snapshotRemoteOid]: true } },
  history: { kind: "complete" },
} as const;

describe("worktree snapshot schema", () => {
  it.each([
    { state: "skipped", evidence: "not-applicable", overrides: { remoteSyncEnabled: false } },
    { state: "detached-head", evidence: "not-applicable", overrides: { branch: null } },
    { state: "no-remote", evidence: "not-applicable", overrides: { originConfigured: false } },
    { state: "no-upstream", evidence: "not-applicable", overrides: { upstreamBranch: null } },
    { state: "branch-gone", evidence: "exact", overrides: {
      snapshot: { kind: "available", scope: "exact", tips: {} },
    } },
    { state: "remote-unavailable", evidence: "pending-fetch", overrides: {
      objectAvailability: { kind: "complete", commits: { [snapshotRemoteOid]: false } },
    } },
    { state: "remote-unavailable", evidence: "unreachable", overrides: {
      snapshot: { kind: "unreachable", failureReason: "network" },
    } },
    { state: "clean", evidence: "exact", overrides: {}, localOid: snapshotRemoteOid },
    { state: "remote-ahead", evidence: "exact", overrides: {}, distance: "0\t2" },
    { state: "local-ahead", evidence: "exact", overrides: {}, distance: "2\t0" },
    { state: "diverged", evidence: "exact", overrides: {}, distance: "2\t3" },
  ])("parses producer $state/$evidence output", async ({ state, evidence, overrides, localOid, distance }) => {
    const { exec } = buildExec({
      "rev-parse HEAD": { stdout: localOid ?? snapshotLocalOid, stderr: "" },
      [REV_LIST_COUNT]: { stdout: distance ?? "0\t0", stderr: "" },
    });
    const result = await analyzeWorktreeSnapshot({
      ...snapshotBase, ...overrides, exec,
    } as Parameters<typeof analyzeWorktreeSnapshot>[0]);
    expect(result.state).toBe(state);
    expect(result.remoteEvidence).toBe(evidence);
    assertSchemaAccepts(WorktreeSnapshotAnalysisResultSchema, result);
  });

  it("parses the legacy status producer and names an undeclared key", async () => {
    const { exec } = buildExec({ [REV_PARSE_HEAD]: { stdout: "main", stderr: "" } });
    const result = await runWorktreeSyncStatus({ exec, remoteSyncEnabled: false });
    assertSchemaAccepts(WorktreeSyncStatusResultSchema, result);
    expect(() => WorktreeSyncStatusResultSchema.parse({ ...result, unexpected: true })).toThrow(/unexpected/u);
  });

  it("names an undeclared snapshot field", async () => {
    const { exec } = buildExec({});
    const result = await analyzeWorktreeSnapshot({
      ...snapshotBase, exec, remoteSyncEnabled: false,
    } as Parameters<typeof analyzeWorktreeSnapshot>[0]);
    expect(() => WorktreeSnapshotAnalysisResultSchema.parse({ ...result, unexpected: true }))
      .toThrow(/unexpected/u);
  });

  it("requires a failure reason only for unreachable snapshot evidence", async () => {
    const { exec } = buildExec({});
    const inapplicable = await analyzeWorktreeSnapshot({
      ...snapshotBase, exec, remoteSyncEnabled: false,
    } as Parameters<typeof analyzeWorktreeSnapshot>[0]);
    assertSchemaRefuses(WorktreeSnapshotAnalysisResultSchema, {
      ...inapplicable, failureReason: "network",
    });

    const unreachable = await analyzeWorktreeSnapshot({
      ...snapshotBase, exec, snapshot: { kind: "unreachable", failureReason: "network" },
    } as Parameters<typeof analyzeWorktreeSnapshot>[0]);
    const withoutReason = structuredClone(unreachable) as Record<string, unknown>;
    delete withoutReason.failureReason;
    assertSchemaRefuses(WorktreeSnapshotAnalysisResultSchema, withoutReason);
  });
});

describe("readConfiguredUpstreamBranch", () => {
  function recordingExec(stdout: string): { exec: GitExec; seen: () => GitExecOptions | undefined } {
    let observed: GitExecOptions | undefined;
    const exec: GitExec = async (_command, _args, options) => {
      observed = options;
      return { stdout, stderr: "" };
    };
    return { exec, seen: () => observed };
  }

  it("reads from the named repository root when one is supplied", async () => {
    // The executor carries no root: unbound, this resolves against the process
    // directory and can report an upstream from a different repository.
    const { exec, seen } = recordingExec("origin/feat/a\n");

    await expect(readConfiguredUpstreamBranch(exec, "feat/a", "/repo/root")).resolves.toBe("feat/a");
    expect(seen()).toEqual({ cwd: "/repo/root" });
  });

  it("passes no directory option when no root is supplied", async () => {
    const { exec, seen } = recordingExec("origin/feat/a\n");

    await readConfiguredUpstreamBranch(exec, "feat/a");

    expect(seen()).toEqual({});
  });

  it("preserves a tracked branch name containing a slash", async () => {
    const { exec } = recordingExec("origin/feat/nested/name\n");

    await expect(readConfiguredUpstreamBranch(exec, "local")).resolves.toBe("feat/nested/name");
  });

  it("reports no upstream for a remote other than origin", async () => {
    // The advertised tips this is compared against come from origin, so a branch
    // tracking elsewhere has no comparable upstream — returning its bare name would
    // silently compare a foreign branch against origin's tip of the same name.
    const { exec } = recordingExec("upstream/feat/a\n");

    await expect(readConfiguredUpstreamBranch(exec, "feat/a")).resolves.toBeNull();
  });

  it("reports no upstream when the branch tracks nothing", async () => {
    const { exec } = recordingExec("\n");

    await expect(readConfiguredUpstreamBranch(exec, "feat/a")).resolves.toBeNull();
  });

  it("refuses an ambiguous multi-record upstream read", async () => {
    const { exec } = recordingExec("origin/a\norigin/b\n");

    await expect(readConfiguredUpstreamBranch(exec, "feat/a")).rejects.toThrow(/unique worktree upstream/u);
  });
});

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

  it("classifies detachment ahead of the disabled-sync shortcut", async () => {
    // Both conditions hold at once. Reporting `skipped` here would carry a null branch
    // under a state whose envelope invariant requires a named one, so the composite
    // would reject its own result rather than describe a detached HEAD.
    const { exec } = buildExec({});

    await expect(analyzeWorktreeSnapshot({
      exec,
      remoteSyncEnabled: false,
      originConfigured: true,
      branch: null,
      upstreamBranch: null,
      snapshot: { kind: "unreachable", failureReason: "network" },
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
      [`rev-list --left-right --count ${localOid}...${advertisedOid}`]: { stdout: "0\t3", stderr: "" },
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
    ["execution failure", (args: string[]) => {
      throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "graph failed" });
    }, /graph failed/u],
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

describe("runPassiveWorktreeInspection", () => {
  it("compares against a renamed branch configured on origin", async () => {
    const oid = "5".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "local-name\n", stderr: "" },
      "remote": { stdout: "origin\n", stderr: "" },
      "for-each-ref *": { stdout: "origin/published-name\n", stderr: "" },
      "ls-remote --heads origin refs/heads/published-name": {
        stdout: `${oid}\trefs/heads/published-name\n`,
        stderr: "",
      },
      "rev-parse HEAD": { stdout: `${oid}\n`, stderr: "" },
    });

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput: async () => `${oid} commit 123\n`,
      remoteSyncEnabled: true,
    })).resolves.toMatchObject({ state: "clean", remoteEvidence: "exact" });
  });

  it("returns an exact relation from one advertised tip without materializing it", async () => {
    const localOid = "6".repeat(40);
    const advertisedOid = "7".repeat(40);
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main\n", stderr: "" },
      "remote": { stdout: "origin\n", stderr: "" },
      "for-each-ref *": { stdout: "origin/main\n", stderr: "" },
      "ls-remote *": { stdout: `${advertisedOid}\trefs/heads/main\n`, stderr: "" },
      "rev-parse --is-shallow-repository": { stdout: "false", stderr: "" },
      "rev-parse HEAD": { stdout: `${localOid}\n`, stderr: "" },
      [REV_LIST_COUNT]: { stdout: "0\t2\n", stderr: "" },
    });
    let objectReadCount = 0;
    const execInput: GitExecInput = async (args, input, options) => {
      objectReadCount += 1;
      if (
        args.join(" ") !== "cat-file --batch-check"
        || input !== `${advertisedOid}\n`
        || options?.objectAccess !== "local-only"
      ) {
        throw new Error("unexpected object availability read");
      }
      return `${advertisedOid} commit 123\n`;
    };

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput,
      remoteSyncEnabled: true,
    })).resolves.toEqual({
      state: "remote-ahead",
      ahead: 0,
      behind: 2,
      branch: "main",
      remoteEvidence: "exact",
    });
    expect(calls.filter(({ args }) => args[0] === "ls-remote")).toHaveLength(1);
    expect(objectReadCount).toBe(1);
    expect(calls.every(({ args }) => !["fetch", "update-ref"].includes(args[0] ?? ""))).toBe(true);
  });

  it("returns pending evidence when the advertised tip is absent locally", async () => {
    const advertisedOid = "8".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main\n", stderr: "" },
      "remote": { stdout: "origin\n", stderr: "" },
      "for-each-ref *": { stdout: "origin/main\n", stderr: "" },
      "ls-remote *": { stdout: `${advertisedOid}\trefs/heads/main\n`, stderr: "" },
    });

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput: async () => `${advertisedOid} missing\n`,
      remoteSyncEnabled: true,
    })).resolves.toEqual({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "pending-fetch",
    });
  });

  it("returns typed unreachable evidence from the bounded exact reader", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main\n", stderr: "" },
      "remote": { stdout: "origin\n", stderr: "" },
      "for-each-ref *": { stdout: "origin/main\n", stderr: "" },
      "ls-remote *": () => {
        throw new GitProcessError({
          kind: "nonzero-exit",
          command: "git",
          args: ["ls-remote"],
          exitCode: 128,
          stderr: "fatal: Could not resolve host remote.example",
        });
      },
    });

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput: async () => { throw new Error("object read must not run"); },
      remoteSyncEnabled: true,
    })).resolves.toEqual({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "unreachable",
      failureReason: "network",
    });
  });

  it("returns exact branch absence without inspecting local objects", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feature/gone\n", stderr: "" },
      "remote": { stdout: "origin\n", stderr: "" },
      "for-each-ref *": { stdout: "origin/feature/gone\n", stderr: "" },
      "ls-remote *": { stdout: "", stderr: "" },
    });

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput: async () => { throw new Error("object read must not run"); },
      remoteSyncEnabled: true,
    })).resolves.toEqual({
      state: "branch-gone",
      ahead: 0,
      behind: 0,
      branch: "feature/gone",
      remoteEvidence: "exact",
    });
  });

  it.each([
    ["disabled inspection", false, "main\n", "origin\n", "origin/main\n", "skipped", "main"],
    ["detached head", true, "HEAD\n", "origin\n", "origin/main\n", "detached-head", null],
    ["no origin", true, "main\n", "upstream\n", "origin/main\n", "no-remote", "main"],
    ["no upstream", true, "main\n", "origin\n", "\n", "no-upstream", "main"],
  ] as const)("returns not-applicable for %s without a remote or object read", async (
    _label,
    remoteSyncEnabled,
    branchOutput,
    remoteOutput,
    upstreamOutput,
    state,
    branch,
  ) => {
    const commands: string[] = [];
    const exec: GitExec = async (_command, args) => {
      commands.push(args[0] ?? "");
      if (args[0] === "rev-parse") return { stdout: branchOutput };
      if (args[0] === "remote") return { stdout: remoteOutput };
      if (args[0] === "for-each-ref") return { stdout: upstreamOutput };
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    let objectRead = false;

    await expect(runPassiveWorktreeInspection({
      exec,
      execInput: async () => {
        objectRead = true;
        throw new Error("object read must not run");
      },
      remoteSyncEnabled,
    })).resolves.toEqual({
      state,
      ahead: 0,
      behind: 0,
      branch,
      remoteEvidence: "not-applicable",
    });
    expect(commands).not.toContain("ls-remote");
    expect(objectRead).toBe(false);
  });

  it.each(["branch", "remote configuration", "upstream", "object inspection"] as const)(
    "propagates a local %s failure",
    async (failureStage) => {
      const advertisedOid = "9".repeat(40);
      const exec: GitExec = async (command, args) => {
        if (failureStage === "branch" && args[0] === "rev-parse") {
          throw makeGitProcessError({ command, args, exitCode: 128, stderr: "branch failed" });
        }
        if (args[0] === "rev-parse") return { stdout: "main\n" };
        if (failureStage === "remote configuration" && args[0] === "remote") {
          throw makeGitProcessError({ command, args, exitCode: 128, stderr: "remote configuration failed" });
        }
        if (args[0] === "remote") return { stdout: "origin\n" };
        if (failureStage === "upstream" && args[0] === "for-each-ref") {
          throw makeGitProcessError({ command, args, exitCode: 128, stderr: "upstream failed" });
        }
        if (args[0] === "for-each-ref") return { stdout: "origin/main\n" };
        if (args[0] === "ls-remote") {
          return { stdout: `${advertisedOid}\trefs/heads/main\n` };
        }
        throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
      };
      const execInput: GitExecInput = async (args) => {
        if (failureStage === "object inspection") {
          throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "object inspection failed" });
        }
        return `${advertisedOid} missing\n`;
      };

      const expectedMessage = {
        branch: "branch failed",
        "remote configuration": "remote configuration failed",
        upstream: "upstream failed",
        "object inspection": "Cannot inspect advertised worktree object availability.",
      }[failureStage];

      await expect(runPassiveWorktreeInspection({
        exec,
        execInput,
        remoteSyncEnabled: true,
      })).rejects.toThrow(expectedMessage);
    },
  );
});

describe("runMaterializingWorktreeInspection", () => {
  it("materializes the renamed branch configured on origin", async () => {
    const oid = "9".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "local-name", stderr: "" },
      "for-each-ref *": { stdout: "origin/published-name", stderr: "" },
      "fetch origin published-name": { stdout: "", stderr: "" },
      "rev-parse origin/published-name": { stdout: oid, stderr: "" },
      "rev-parse --verify *": { stdout: oid, stderr: "" },
      "rev-parse --is-shallow-repository": { stdout: "false", stderr: "" },
      "rev-parse HEAD": { stdout: oid, stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toMatchObject({
      state: "clean",
      remoteEvidence: "exact",
    });
  });

  it("treats a configured non-origin upstream as locally inapplicable", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "upstream/main", stderr: "" },
      "remote get-url origin": { stdout: "git@example.test:repo.git", stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toMatchObject({
      state: "no-upstream",
      remoteEvidence: "not-applicable",
    });
    expect(calls.some((call) => call.args[0] === "fetch")).toBe(false);
  });

  it("rejects an empty origin upstream branch name", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/", stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).rejects.toThrow(/origin branch name/u);
  });

  it("returns an exact clean relation after materializing the tracked branch", async () => {
    const oid = "a".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      "rev-parse origin/main": { stdout: oid, stderr: "" },
      "rev-parse --verify *": { stdout: oid, stderr: "" },
      "rev-parse --is-shallow-repository": { stdout: "false", stderr: "" },
      "rev-parse HEAD": { stdout: oid, stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toEqual({
      state: "clean",
      ahead: 0,
      behind: 0,
      branch: "main",
      remoteEvidence: "exact",
    });
  });

  it("pins every materializing Git command to the supplied repository root", async () => {
    const oid = "a".repeat(40);
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      "rev-parse origin/main": { stdout: oid, stderr: "" },
      "rev-parse --verify *": { stdout: oid, stderr: "" },
      "rev-parse --is-shallow-repository": { stdout: "false", stderr: "" },
      "rev-parse HEAD": { stdout: oid, stderr: "" },
    });

    await runMaterializingWorktreeInspection({ exec, cwd: "/repo" });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.options?.cwd === "/repo")).toBe(true);
  });

  it("analyzes distance against the materialized remote OID", async () => {
    const remoteOid = "a".repeat(40);
    const localOid = "b".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      "rev-parse origin/main": { stdout: remoteOid, stderr: "" },
      "rev-parse --verify *": { stdout: remoteOid, stderr: "" },
      "rev-parse --is-shallow-repository": { stdout: "false", stderr: "" },
      "rev-parse HEAD": { stdout: localOid, stderr: "" },
      [`rev-list --left-right --count ${localOid}...${remoteOid}`]: { stdout: "0\t3", stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toEqual({
      state: "remote-ahead",
      ahead: 0,
      behind: 3,
      branch: "main",
      remoteEvidence: "exact",
    });
  });

  it("fails visibly when materialization times out", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: (args, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(makeGitProcessError({ command: "git", args, isCanceled: true, stderr: "canceled" }));
        });
      }),
    });

    await expect(runMaterializingWorktreeInspection({
      exec,
      fetchTimeoutMs: 25,
    })).rejects.toThrow(/timed out/u);
  });

  it.each([
    ["authentication", "fatal: Authentication failed for 'https://example.test/repo.git'"],
    ["network", "fatal: unable to access remote: Could not resolve host: example.test"],
    ["metadata write", "error: cannot lock ref 'refs/remotes/origin/main': Permission denied"],
  ])("fails visibly on %s materialization errors", async (_name, message) => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: () => {
        throw new GitProcessError({
          kind: "nonzero-exit",
          command: "git",
          args: ["fetch", "origin", "main"],
          exitCode: 128,
          stderr: message,
        });
      },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).rejects.toMatchObject({ stderr: message });
  });

  it("fails visibly when the materialized tracking ref does not resolve to a local commit", async () => {
    const oid = "a".repeat(40);
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "origin/main", stderr: "" },
      [FETCH_BRANCH]: { stdout: "", stderr: "" },
      "rev-parse origin/main": { stdout: oid, stderr: "" },
      "rev-parse --verify *": (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "missing commit object" });
      },
    });

    await expect(runMaterializingWorktreeInspection({ exec }))
      .rejects.toThrow(/materialized worktree commit is not available locally/u);
  });

  it("returns exact branch-gone evidence for an absent remote ref", async () => {
    const { exec } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "feat/x", stderr: "" },
      "for-each-ref *": { stdout: "origin/feat/x", stderr: "" },
      [FETCH_BRANCH]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "fatal: couldn't find remote ref refs/heads/feat/x" });
      },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toEqual({
      state: "branch-gone",
      ahead: 0,
      behind: 0,
      branch: "feat/x",
      remoteEvidence: "exact",
    });
  });

  it("preserves detached-head without attempting materialization", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "HEAD", stderr: "" },
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toMatchObject({
      state: "detached-head",
      remoteEvidence: "not-applicable",
    });
    expect(calls.some((call) => call.args[0] === "fetch")).toBe(false);
  });

  it.each([
    ["no-upstream", { stdout: "git@example.test:repo.git", stderr: "" }],
    ["no-remote", (args: string[]) => {
      throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "origin is not configured" });
    }],
  ] as const)("preserves %s without attempting materialization", async (state, originResponse) => {
    const { exec, calls } = buildExec({
      [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
      "for-each-ref *": { stdout: "\n", stderr: "" },
      "remote get-url origin": originResponse,
    });

    await expect(runMaterializingWorktreeInspection({ exec })).resolves.toMatchObject({
      state,
      remoteEvidence: "not-applicable",
    });
    expect(calls.some((call) => call.args[0] === "fetch")).toBe(false);
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
      [REV_LIST_COUNT]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: bad revision" });
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
      [REV_PARSE_UPSTREAM]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "fatal: no upstream configured for branch 'feature/x'" });
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
      [REV_PARSE_UPSTREAM]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "fatal: no upstream configured for branch 'main'" });
      },
      "remote get-url origin": (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: No such remote 'origin'" });
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
      [FETCH_BRANCH]: (args, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(makeGitProcessError({ command: "git", args, isCanceled: true, stderr: "canceled" }));
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
      [FETCH_BRANCH]: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "fatal: could not read Username for 'https://github.com': terminal prompts disabled" });
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
      [FETCH_BRANCH]: (args) => {
        throw makeGitProcessError({ command: "git", args,
          exitCode: 128,
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
      [FETCH_BRANCH]: (args) => {
        throw makeGitProcessError({ command: "git", args,
          exitCode: 128,
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
