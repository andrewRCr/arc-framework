import { describe, it, expect, vi } from "vitest";

import {
  assessRoadmapConflictAutoRemedy,
  applyRoadmapConflictAutoRemedy,
  formatRoadmapConflictAutoRemedyMessage,
  type RoadmapConflictAutoRemedyAssessmentInput,
} from "../../../src/lib/status/roadmap-conflict-auto-remedy.js";
import { ROADMAP_PATH } from "../../../src/lib/status/roadmap-regeneration-assert.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

function assessment(
  overrides: Partial<RoadmapConflictAutoRemedyAssessmentInput> = {},
): RoadmapConflictAutoRemedyAssessmentInput {
  return {
    mergeLike: true,
    unmergedPaths: [],
    stagedMarkerPaths: [],
    roadmapStaged: false,
    ...overrides,
  };
}

describe("assessRoadmapConflictAutoRemedy", () => {
  it("is eligible when ROADMAP is the only unmerged path", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      unmergedPaths: [ROADMAP_PATH],
    }))).toEqual({ eligible: true, trigger: "unmerged-only-roadmap" });
  });

  it("is eligible when ROADMAP is the only staged path with conflict markers", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      mergeLike: false,
      stagedMarkerPaths: [ROADMAP_PATH],
      roadmapStaged: true,
    }))).toEqual({ eligible: true, trigger: "markers-only-roadmap" });
  });

  it("is eligible for merge-like commits that stage ROADMAP without remaining markers", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      roadmapStaged: true,
    }))).toEqual({ eligible: true, trigger: "merge-staged-roadmap" });
  });

  it("refuses when any non-ROADMAP path is unmerged", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      unmergedPaths: [ROADMAP_PATH, "src/foo.ts"],
    }))).toEqual({ eligible: false, reason: "wider-conflict" });
  });

  it("refuses when any non-ROADMAP staged path still has conflict markers", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      stagedMarkerPaths: [ROADMAP_PATH, "README.md"],
      roadmapStaged: true,
    }))).toEqual({ eligible: false, reason: "wider-conflict" });
  });

  it("skips outside a merge-like state when ROADMAP is not marker-bearing", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      mergeLike: false,
      roadmapStaged: true,
    }))).toEqual({ eligible: false, reason: "not-merge-like" });
  });

  it("skips a merge-like state that does not involve ROADMAP", () => {
    expect(assessRoadmapConflictAutoRemedy(assessment({
      roadmapStaged: false,
    }))).toEqual({ eligible: false, reason: "roadmap-not-involved" });
  });
});

describe("applyRoadmapConflictAutoRemedy", () => {
  it("writes the regenerated ROADMAP and restages it when eligible", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const gitArgs: string[][] = [];

    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      gitArgs.push([...args]);
      if (args[0] === "ls-files") return { stdout: "", stderr: "" };
      if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
      if (args[0] === "worktree") return { stdout: "", stderr: "" };
      if (args[0] === "ls-tree") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "fix/example\n", stderr: "" };
      }
      if (args[0] === "add") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

    const result = await applyRoadmapConflictAutoRemedy(
      {
        cwd: "/repo",
        exec,
        writeFile: async (path, content) => {
          writes.push({ path, content });
        },
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "markers-only-roadmap" },
    );

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.trigger).toBe("markers-only-roadmap");
    }
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe(`/repo/${ROADMAP_PATH}`);
    expect(writes[0]?.content.length).toBeGreaterThan(0);
    expect(writes[0]?.content.endsWith("\n")).toBe(true);
    expect(gitArgs.some((args) => args[0] === "add" && args.includes(ROADMAP_PATH))).toBe(true);
  });

  it("returns skipped without writing when ineligible", async () => {
    const writeFile = vi.fn();
    const exec = vi.fn(async (): Promise<ExecResult> => {
      throw new Error("exec should not run when assessment is pre-skipped");
    });

    const result = await applyRoadmapConflictAutoRemedy(
      { cwd: "/repo", exec, writeFile },
      { eligible: false, reason: "wider-conflict" },
    );

    expect(result).toEqual({ status: "skipped", reason: "wider-conflict" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("returns failed when the worktree write throws", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (args[0] === "ls-files") return { stdout: "", stderr: "" };
      if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
      if (args[0] === "worktree") return { stdout: "", stderr: "" };
      if (args[0] === "ls-tree") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "fix/example\n", stderr: "" };
      }
      if (args[0] === "add") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

    const result = await applyRoadmapConflictAutoRemedy(
      {
        cwd: "/repo",
        exec,
        writeFile: async () => {
          throw new Error("disk full");
        },
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "unmerged-only-roadmap" },
    );

    expect(result).toEqual({ status: "failed", message: "disk full" });
  });
});

describe("formatRoadmapConflictAutoRemedyMessage", () => {
  it("is silent on skip", () => {
    expect(formatRoadmapConflictAutoRemedyMessage({
      status: "skipped",
      reason: "not-merge-like",
    })).toBe("");
  });

  it("names the path on apply", () => {
    const message = formatRoadmapConflictAutoRemedyMessage({
      status: "applied",
      trigger: "markers-only-roadmap",
      indeterminate: false,
    });
    expect(message).toContain(ROADMAP_PATH);
    expect(message).toContain("Auto-remedied");
  });

  it("surfaces failure detail", () => {
    expect(formatRoadmapConflictAutoRemedyMessage({
      status: "failed",
      message: "disk full",
    })).toContain("disk full");
  });
});
