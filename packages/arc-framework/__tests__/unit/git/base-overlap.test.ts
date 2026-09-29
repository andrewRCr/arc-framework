import { describe, expect, it } from "vitest";

import {
  analyzeBaseOverlap,
  analyzeRevisionOverlap,
  resolveSoleMergeBase,
} from "../../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

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
    expect(calls).toContainEqual(["merge-base", "--all", HEAD, BASE]);
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

  it("reports a history with multiple best merge bases as ambiguous", async () => {
    const head = "c".repeat(40);
    const otherBase = "d".repeat(40);
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "merge-base") {
        return { stdout: args.includes("--all")
          ? `${MERGE_BASE}\n${otherBase}\n`
          : `${MERGE_BASE}\n` };
      }
      if (args[0] === "diff") return { stdout: "" };
      throw new Error("unexpected invocation");
    };

    const result = await analyzeRevisionOverlap({
      exec,
      leftRevision: head,
      rightRevision: BASE,
      treatmentContext: {},
    });

    expect(result).toMatchObject({ status: "ambiguous" });
    expect(result).toHaveProperty("detail");
    // The branch returns before a base is chosen and before any changed-path read, so there is nothing
    // downstream may assume is there.
    expect(result).not.toHaveProperty("mergeBase");
    expect(result).not.toHaveProperty("overlap");
  });

  it("reports revisions with no common ancestor as unrelated rather than ambiguous", async () => {
    const head = "c".repeat(40);
    const exec: GitExec = async () => {
      throw new GitProcessError({
        kind: "nonzero-exit", command: "git", args: ["merge-base", "--all", head, BASE], exitCode: 1,
      });
    };

    await expect(analyzeRevisionOverlap({
      exec, leftRevision: head, rightRevision: BASE, treatmentContext: {},
    })).resolves.toMatchObject({ status: "unrelated" });
  });

  it("reports a merge-base read that failed as unavailable rather than ambiguous", async () => {
    const head = "c".repeat(40);
    const exec: GitExec = async () => {
      throw new GitProcessError({
        kind: "spawn-failure", command: "git", args: ["merge-base", "--all", head, BASE],
      });
    };

    await expect(analyzeRevisionOverlap({
      exec, leftRevision: head, rightRevision: BASE, treatmentContext: {},
    })).resolves.toMatchObject({ status: "unavailable", reason: "merge-base-failed" });
  });

  it("still refuses a revision that is not an object id ahead of any read", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      return { stdout: "" };
    };

    await expect(analyzeRevisionOverlap({
      exec, leftRevision: "HEAD", rightRevision: BASE, treatmentContext: {},
    })).resolves.toMatchObject({ status: "unavailable", reason: "invalid-revision" });
    expect(calls).toEqual([]);
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

  it("reports an unrelated pair as unrelated rather than a failed merge base", async () => {
    const exec: GitExec = async () => {
      throw new GitProcessError({
        kind: "nonzero-exit", command: "git", args: ["merge-base", "--all"], exitCode: 1,
      });
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 1, behind: 1, classify: () => "reviewable",
    })).resolves.toEqual({ status: "unrelated" });
  });

  it("reports a pair with two best merge bases as ambiguous rather than a failed read", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n${"d".repeat(40)}\n` };
      throw new Error("unexpected invocation");
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 1, behind: 1, classify: () => "reviewable",
    })).resolves.toEqual({ status: "ambiguous" });
  });

  it("still reports a merge-base read that failed as unavailable", async () => {
    const exec: GitExec = async () => {
      throw new GitProcessError({ kind: "spawn-failure", command: "git", args: ["merge-base", "--all"] });
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 1, behind: 1, classify: () => "reviewable",
    })).resolves.toEqual({ status: "unavailable", reason: "merge-base-failed" });
  });

  it("distinguishes a failed base-side diff from empty overlap", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "merge-base") return { stdout: `${MERGE_BASE}\n` };
      if (args.at(-1) === `${MERGE_BASE}..${"c".repeat(40)}`) return { stdout: "a.ts\0" };
      throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "base diff failed" });
    };
    await expect(analyzeBaseOverlap({
      exec, baseOid: BASE, headOid: "c".repeat(40), ahead: 1, behind: 1, classify: () => "reviewable",
    })).resolves.toEqual({ status: "unavailable", reason: "base-diff-failed" });
  });
});

describe("the sole base a comparison can be proved from", () => {
  const LEFT = "c".repeat(40);
  const OTHER_BASE = "d".repeat(40);

  const resolve = (respond: () => { stdout: string }) => resolveSoleMergeBase({
    exec: async (_cmd, args) => {
      if (args[0] !== "merge-base" || !args.includes("--all")) throw new Error("unexpected invocation");
      return respond();
    },
    leftRevision: LEFT,
    rightRevision: BASE,
  });

  const rejectWith = (init: ConstructorParameters<typeof GitProcessError>[0]) => resolve(() => {
    throw new GitProcessError(init);
  });

  const invocation = { command: "git", args: ["merge-base", "--all", LEFT, BASE] } as const;

  it("returns the only merge base when the history leaves exactly one", async () => {
    await expect(resolve(() => ({ stdout: `${MERGE_BASE}\n` })))
      .resolves.toEqual({ status: "resolved", mergeBase: MERGE_BASE });
  });

  it("reports two equally good merge bases without picking either one", async () => {
    const result = await resolve(() => ({ stdout: `${MERGE_BASE}\n${OTHER_BASE}\n` }));

    expect(result).toMatchObject({ status: "ambiguous", count: 2 });
    // The whole point of the arm: no caller can read a chosen base off it, by accident or otherwise.
    expect(result).not.toHaveProperty("mergeBase");
  });

  it("reports revisions with no common ancestor as unrelated", async () => {
    await expect(rejectWith({ ...invocation, kind: "nonzero-exit", exitCode: 1 }))
      .resolves.toMatchObject({ status: "unrelated" });
  });

  it("reports a read that failed as unavailable rather than throwing", async () => {
    await expect(rejectWith({ ...invocation, kind: "spawn-failure" }))
      .resolves.toMatchObject({ status: "unavailable" });
  });

  it("reports a read that answered with nothing usable as unavailable", async () => {
    await expect(resolve(() => ({ stdout: "\n" })))
      .resolves.toMatchObject({ status: "unavailable" });
  });
});
