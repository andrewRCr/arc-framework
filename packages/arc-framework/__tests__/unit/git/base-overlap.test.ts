import { describe, expect, it } from "vitest";

import { analyzeBaseOverlap } from "../../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const BASE = "b".repeat(40);
const MERGE_BASE = "a".repeat(40);

function overlapExec(branch: string, base: string): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n` };
    if (args.at(-1) === `${MERGE_BASE}..HEAD`) return { stdout: branch };
    if (args.at(-1) === `${MERGE_BASE}..${BASE}`) return { stdout: base };
    throw new Error("unexpected invocation");
  };
  return { exec, calls };
}

describe("base overlap evidence", () => {
  it("short-circuits to available empty when either side has no unique commits", async () => {
    const { exec, calls } = overlapExec("", "");
    const result = await analyzeBaseOverlap({
      exec, baseOid: BASE, ahead: 0, behind: 2, classify: () => "substantive",
    });
    expect(result).toEqual({ status: "available", substantivePaths: [], regenerablePaths: [] });
    expect(calls).toEqual([]);
  });

  it("partitions, deduplicates, and sorts shared paths", async () => {
    const { exec, calls } = overlapExec("z.ts\0ROADMAP\0a.ts\0", "ROADMAP\0z.ts\0a.ts\0");
    const result = await analyzeBaseOverlap({
      exec,
      baseOid: BASE,
      ahead: 2,
      behind: 3,
      classify: (path) => path === "ROADMAP" ? "regenerable" : "substantive",
    });
    expect(result).toEqual({
      status: "available",
      substantivePaths: ["a.ts", "z.ts"],
      regenerablePaths: ["ROADMAP"],
    });
    expect(calls.filter((args) => args[0] === "diff")).toSatisfy(
      (entries: string[][]) => entries.every((args) => args.includes("--no-renames") && args.includes("-z")),
    );
  });

  it("distinguishes a failed base-side diff from empty overlap", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n` };
      if (args.at(-1) === `${MERGE_BASE}..HEAD`) return { stdout: "a.ts\0" };
      throw new Error("base diff failed");
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, ahead: 1, behind: 1, classify: () => "substantive",
    })).resolves.toEqual({ status: "unavailable", reason: "base-diff-failed" });
  });
});
