import { describe, it, expect } from "vitest";

import { detectSupersession } from "../../../src/lib/git/supersession.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

type ResponseFn = (args: string[]) => ExecResult | Promise<ExecResult>;

/**
 * Build a GitExec mock keyed off the first argument. Returns `{ exec, calls }`
 * so tests can assert recorded invocations.
 */
function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push({ cmd, args });
    const key = args[0] ?? "";
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    return typeof entry === "function" ? entry(args) : entry;
  };
  return { exec, calls };
}

describe("detectSupersession", () => {
  it("detects supersession when every local-ahead commit is patch-equal to a remote prefix", async () => {
    // A rebased remote prefix: `git cherry` marks each local commit `-` (has an
    // equivalent upstream).
    const { exec, calls } = buildExec({
      cherry: { stdout: "- aaa111\n- bbb222\n- ccc333\n", stderr: "" },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(true);
    expect(result.supersededCommits).toEqual(["aaa111", "bbb222", "ccc333"]);
    expect(result.novelCommits).toEqual([]);
    // Bounded to the local-ahead set — cherry compares HEAD against origin/<branch>.
    const cherry = calls.find((c) => c.args[0] === "cherry");
    expect(cherry?.args).toEqual(["cherry", "origin/feat/x", "HEAD"]);
  });

  it("does not detect supersession when local commits are genuinely divergent", async () => {
    // No patch-equal remote equivalent: every commit marked `+`.
    const { exec } = buildExec({
      cherry: { stdout: "+ aaa111\n+ bbb222\n", stderr: "" },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual([]);
    expect(result.novelCommits).toEqual(["aaa111", "bbb222"]);
  });

  it("does not detect a clean supersession on partial overlap (some superseded, some novel)", async () => {
    // A reset would discard the novel commit, so this is not a lossless supersession.
    const { exec } = buildExec({
      cherry: { stdout: "- aaa111\n+ zzz999\n", stderr: "" },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual(["aaa111"]);
    expect(result.novelCommits).toEqual(["zzz999"]);
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

  it("degrades to not-superseded when the cherry read fails", async () => {
    const { exec } = buildExec({
      cherry: () => {
        throw new Error("fatal: bad revision 'origin/feat/x'");
      },
    });

    const result = await detectSupersession({ exec, branch: "feat/x" });

    expect(result.superseded).toBe(false);
    expect(result.supersededCommits).toEqual([]);
    expect(result.novelCommits).toEqual([]);
  });
});
