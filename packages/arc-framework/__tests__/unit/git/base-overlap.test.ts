import { describe, expect, it } from "vitest";

import {
  analyzeBaseOverlap,
  analyzeRevisionOverlap,
} from "../../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const BASE = "b".repeat(40);
const MERGE_BASE = "a".repeat(40);

function overlapExec(branch: string, base: string): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n` };
    if (args.at(-1) === `${MERGE_BASE}..${BASE}`) return { stdout: base };
    if (args.at(-1)?.startsWith(`${MERGE_BASE}..`) === true) return { stdout: branch };
    throw new Error("unexpected invocation");
  };
  return { exec, calls };
}

describe("base overlap evidence", () => {
  it("classifies an explicit revision pair with bound treatment context", async () => {
    const HEAD = "c".repeat(40);
    const { exec, calls } = overlapExec(
      ".arc/active/meta-example.md\0.arc/backlog/ROADMAP.md\0src/shared.ts\0",
      ".arc/active/meta-example.md\0.arc/backlog/ROADMAP.md\0src/shared.ts\0",
    );

    await expect(analyzeRevisionOverlap({
      exec,
      leftRevision: HEAD,
      rightRevision: BASE,
      treatmentContext: { workUnit: "example" },
    })).resolves.toEqual({
      status: "available",
      mergeBase: MERGE_BASE,
      overlap: {
        status: "available",
        substantivePaths: ["src/shared.ts"],
        regenerablePaths: [".arc/backlog/ROADMAP.md"],
      },
    });
    expect(calls).toContainEqual(["merge-base", HEAD, BASE]);
    expect(calls).toContainEqual([
      "diff", "--name-only", "-z", "--no-renames", `${MERGE_BASE}..${HEAD}`,
    ]);
  });

  it("keeps work-unit paths substantive for an unbound treatment context", async () => {
    const HEAD = "c".repeat(40);
    const { exec } = overlapExec(
      ".arc/active/meta-example.md\0",
      ".arc/active/meta-example.md\0",
    );

    await expect(analyzeRevisionOverlap({
      exec,
      leftRevision: HEAD,
      rightRevision: BASE,
      treatmentContext: {},
    })).resolves.toMatchObject({
      status: "available",
      overlap: { substantivePaths: [".arc/active/meta-example.md"] },
    });
  });

  it("short-circuits to available empty when either side has no unique commits", async () => {
    const { exec, calls } = overlapExec("", "");
    const result = await analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 0, behind: 2, classify: () => "reviewable",
    });
    expect(result).toEqual({ status: "available", substantivePaths: [], regenerablePaths: [] });
    expect(calls).toEqual([]);
  });

  it("partitions, deduplicates, and sorts shared paths", async () => {
    const { exec, calls } = overlapExec(
      "z.ts\0ROADMAP\0meta-example.md\0a.ts\0",
      "ROADMAP\0z.ts\0meta-example.md\0a.ts\0",
    );
    const result = await analyzeBaseOverlap({
      exec,
      baseOid: BASE,
      headOid: "c".repeat(40),
      ahead: 2,
      behind: 3,
      classify: (path) => path === "ROADMAP"
        ? "regenerable"
        : path === "meta-example.md" ? "evidence-neutral" : "reviewable",
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

  it("fails closed when a classifier returns a value outside the current taxonomy", async () => {
    const { exec } = overlapExec("shared.ts\0", "shared.ts\0");

    await expect(analyzeBaseOverlap({
      exec,
      baseOid: BASE,
      headOid: "c".repeat(40),
      ahead: 1,
      behind: 1,
      classify: () => "substantive" as never,
    })).resolves.toEqual({ status: "unavailable", reason: "classification-failed" });
  });

  it("distinguishes a failed base-side diff from empty overlap", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n` };
      if (args.at(-1) === `${MERGE_BASE}..${"c".repeat(40)}`) return { stdout: "a.ts\0" };
      throw new Error("base diff failed");
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 1, behind: 1, classify: () => "reviewable",
    })).resolves.toEqual({ status: "unavailable", reason: "base-diff-failed" });
  });
});
