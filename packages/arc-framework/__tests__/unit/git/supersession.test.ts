import { describe, it, expect } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  analyzeSupersessionSnapshot,
  detectSupersession,
  emptySupersessionResult,
  SupersessionResultSchema,
  SupersessionSnapshotAnalysisResultSchema,
} from "../../../src/lib/git/supersession.js";
import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../../src/lib/git/index.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

type ResponseFn = (
  args: string[],
  options: GitExecOptions | undefined,
) => ExecResult | Promise<ExecResult>;

/**
 * Build a GitExec mock keyed off the first argument. Returns `{ exec, calls }`
 * so tests can assert recorded invocations.
 */
function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args });
    const key = args[0] ?? "";
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

describe("detectSupersession", () => {
  it("detects supersession when every local-ahead commit is patch-equal to a remote prefix", async () => {
    // A rebased remote prefix: `git cherry` marks each local commit `-` (has an
    // equivalent upstream).
    const { exec, calls } = buildExec({
      cherry: {
        stdout:
          "- aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
          + "- bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
          + "- cccccccccccccccccccccccccccccccccccccccc\n",
        stderr: "",
      },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(true);
    assertSchemaAccepts(SupersessionResultSchema, result);
    expect(result.supersededCommits).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "cccccccccccccccccccccccccccccccccccccccc",
    ]);
    expect(result.novelCommits).toEqual([]);
    // Bounded to the local-ahead set — cherry compares HEAD against origin/<branch>.
    const cherry = calls.find((c) => c.args[0] === "cherry");
    expect(cherry?.args).toEqual(["cherry", "origin/feat/x", "HEAD"]);
  });

  it("does not detect supersession when local commits are genuinely divergent", async () => {
    // No patch-equal remote equivalent: every commit marked `+`.
    const { exec } = buildExec({
      cherry: {
        stdout:
          "+ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
          + "+ bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
        stderr: "",
      },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual([]);
    expect(result.novelCommits).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
  });

  it("does not detect a clean supersession on partial overlap (some superseded, some novel)", async () => {
    // A reset would discard the novel commit, so this is not a lossless supersession.
    const { exec } = buildExec({
      cherry: {
        stdout:
          "- aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n"
          + "+ dddddddddddddddddddddddddddddddddddddddd\n",
        stderr: "",
      },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
    expect(result.novelCommits).toEqual(["dddddddddddddddddddddddddddddddddddddddd"]);
  });

  it("does not detect supersession when there are no local-ahead commits", async () => {
    const { exec } = buildExec({
      cherry: { stdout: "", stderr: "" },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual([]);
    expect(result.novelCommits).toEqual([]);
  });

  it("propagates a cherry execution failure", async () => {
    const { exec } = buildExec({
      cherry: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "fatal: bad revision 'origin/feat/x'" });
      },
    });

    await expect(detectSupersession({ exec, branch: "feat/x" }))
      .rejects.toThrow("fatal: bad revision 'origin/feat/x'");
  });
});

describe("analyzeSupersessionSnapshot", () => {
  it("detects force-push supersession against the advertised branch commit", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const supersededOid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { exec } = buildExec({
      cherry: (args, options) => {
        if (args[1] !== advertisedOid) throw new Error("unexpected upstream operand");
        if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
        return { stdout: `- ${supersededOid}\n`, stderr: "" };
      },
    });

    const result = await analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    });

    expect(result).toEqual({
      superseded: true,
      supersededCommits: [supersededOid],
      novelCommits: [],
      remoteEvidence: "exact",
    });
    assertSchemaAccepts(SupersessionSnapshotAnalysisResultSchema, result);
    assertSchemaRefuses(SupersessionSnapshotAnalysisResultSchema, {
      ...result, unexpected: true,
    });
  });

  it("refuses a supersession verdict when local history is shallow", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({});

    await expect(analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "shallow" },
    })).rejects.toThrow("Complete local history is required for supersession analysis.");
  });

  it("suppresses supersession when the advertised commit is pending fetch", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({});

    const result = await analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: false } },
      history: { kind: "complete" },
    });

    expect(result).toEqual({
      superseded: false,
      supersededCommits: [],
      novelCommits: [],
      remoteEvidence: "pending-fetch",
    });
    assertSchemaAccepts(SupersessionSnapshotAnalysisResultSchema, result);
    assertSchemaRefuses(SupersessionSnapshotAnalysisResultSchema, {
      ...result, superseded: true,
    });
  });

  it("uses the upstream branch name when a local tracking branch was renamed", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const supersededOid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { exec } = buildExec({
      cherry: { stdout: `- ${supersededOid}\n`, stderr: "" },
    });

    const result = await analyzeSupersessionSnapshot({
      exec,
      branch: "remote-topic",
      snapshot: { kind: "available", scope: "all-heads", tips: { "remote-topic": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    });

    expect(result.remoteEvidence).toBe("exact");
    expect(result.superseded).toBe(true);
  });

  it("suppresses supersession when advertised branch evidence is unreachable", async () => {
    const { exec } = buildExec({});

    const result = await analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "unreachable", failureReason: "network" },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    });

    expect(result).toEqual({
      superseded: false,
      supersededCommits: [],
      novelCommits: [],
      remoteEvidence: "unreachable",
      failureReason: "network",
    });
    assertSchemaAccepts(SupersessionSnapshotAnalysisResultSchema, result);
  });

  it("preserves exact branch absence from a complete snapshot", async () => {
    const { exec } = buildExec({});

    const result = await analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "shallow" },
    });

    expect(result).toEqual({
      superseded: false,
      supersededCommits: [],
      novelCommits: [],
      remoteEvidence: "exact",
    });
    assertSchemaAccepts(SupersessionSnapshotAnalysisResultSchema, result);
  });

  it("refuses analysis when advertised commit availability is unavailable", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({});

    await expect(analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "complete" },
    })).rejects.toThrow("Advertised commit availability could not be inspected.");
  });

  it("refuses analysis when the advertised commit has no availability fact", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({});

    await expect(analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    })).rejects.toThrow("The advertised branch commit has no local availability fact.");
  });

  it("rejects malformed cherry output", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({
      cherry: { stdout: "? not-an-object-id\n", stderr: "" },
    });

    await expect(analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow("Malformed git cherry output.");
  });

  it("propagates a local cherry execution failure", async () => {
    const advertisedOid = "1111111111111111111111111111111111111111";
    const { exec } = buildExec({
      cherry: (args) => {
        throw makeGitProcessError({ command: "git", args, exitCode: 128,
          stderr: "local graph read failed" });
      },
    });

    await expect(analyzeSupersessionSnapshot({
      exec,
      branch: "feat/x",
      snapshot: { kind: "available", scope: "exact", tips: { "feat/x": advertisedOid } },
      objectAvailability: { kind: "complete", commits: { [advertisedOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow("local graph read failed");
  });
});

describe("emptySupersessionResult", () => {
  it("parses the not-needed result emitted by the session probe", () => {
    const result = emptySupersessionResult();
    assertSchemaAccepts(SupersessionResultSchema, result);
    expect(() => SupersessionResultSchema.parse({ ...result, unexpected: true })).toThrow(/unexpected/u);
  });
});
