import { describe, it, expect, vi } from "vitest";

import {
  assessRoadmapConflictAutoRemedy,
  applyRoadmapConflictAutoRemedy,
  formatRoadmapConflictAutoRemedyMessage,
  type RoadmapConflictAutoRemedyAssessmentInput,
} from "../../../src/lib/status/roadmap-conflict-auto-remedy.js";
import { ROADMAP_PATH } from "../../../src/lib/status/roadmap-regeneration-assert.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

function isStagedTransitionList(args: readonly string[]): boolean {
  return args.join("\0") === [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=AM",
    "-z",
    "--",
    ".arc/system/.internal/transitions",
  ].join("\0");
}

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
  it("regenerates from the staged index without a separate merge-authority adapter", async () => {
    const metaPath = ".arc/active/meta-origin.md";
    const siblingPath = ".arc/active/meta-sibling.md";
    const meta = makeMetaFixture("origin", {
      owner: "andrew", branch: "plan/origin", priority: "P1",
    });
    const siblingMeta = makeMetaFixture("sibling", {
      owner: "andrew", branch: "feat/sibling", priority: "P1",
    });
    let written = "";
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
      if (args[0] === "ls-files") return { stdout: "", stderr: "" };
      if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
      if (args[0] === "worktree") {
        return {
          stdout: worktreePorcelainZ([
            "worktree /tmp/origin",
            `HEAD ${"a".repeat(40)}`,
            "branch refs/heads/plan/origin",
            "",
            "worktree /tmp/sibling",
            `HEAD ${"b".repeat(40)}`,
            "branch refs/heads/feat/sibling",
          ].join("\n")),
          stderr: "",
        };
      }
      if (args[0] === "ls-tree" && args.includes("--name-only")) {
        return {
          stdout: args.includes("feat/sibling") ? `${siblingPath}\n` : `${metaPath}\n`,
          stderr: "",
        };
      }
      if (args.join("\0") === ["show", `plan/origin:${metaPath}`].join("\0")) {
        return { stdout: meta, stderr: "" };
      }
      if (args.join("\0") === ["show", `plan/origin:${siblingPath}`].join("\0")) {
        return { stdout: siblingMeta, stderr: "" };
      }
      if (args.join("\0") === ["show", `feat/sibling:${siblingPath}`].join("\0")) {
        return { stdout: siblingMeta, stderr: "" };
      }
      if (args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "HEAD\n", stderr: "" };
      }
      if (args[0] === "add") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

    const result = await applyRoadmapConflictAutoRemedy(
      {
        cwd: "/repo",
        exec,
        writeFile: async (_path, content) => {
          written = content;
        },
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "merge-staged-roadmap" },
    );

    expect(result.status).toBe("applied");
    expect(written).toMatch(/\| `Active` \| sibling\s+\|/u);
    expect(written).toMatch(/\| `Active` \| origin\s+\|/u);
  });

  it("resolves an unmerged transition through an alternate index before publishing", async () => {
    const head = "a".repeat(40);
    const writes: string[] = [];
    let candidateStaged = false;
    const indexFile = "/repo/.git/index.lock";
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const exec: GitExec = vi.fn(async (_cmd, args, options): Promise<ExecResult> => {
      if (args.join("\0") === ["rev-parse", "--verify", "HEAD^{commit}"].join("\0")) {
        return { stdout: `${head}\n`, stderr: "" };
      }
      if (args.join("\0") === [
        "rev-parse",
        "--verify",
        "refs/heads/main^{commit}",
      ].join("\0")) {
        return { stdout: `${head}\n`, stderr: "" };
      }
      if (args[0] === "ls-files" && args.includes("--unmerged")) {
        return {
          stdout: [
            `100644 ${"c".repeat(40)} 1\t${ROADMAP_PATH}`,
            `100644 ${"d".repeat(40)} 2\t${ROADMAP_PATH}`,
            `100644 ${"b".repeat(40)} 3\t${ROADMAP_PATH}`,
            "",
          ].join("\0"),
          stderr: "",
        };
      }
      if (args[0] === "update-index") {
        if (options?.indexFile !== indexFile) {
          throw new Error("candidate ROADMAP staged outside alternate index");
        }
        candidateStaged = true;
        return { stdout: "", stderr: "" };
      }
      if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
      if (args[0] === "ls-files") return { stdout: "", stderr: "" };
      if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
      if (args[0] === "worktree") return { stdout: "", stderr: "" };
      if (args[0] === "ls-tree") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "main\n", stderr: "" };
      }
      if (args[0] === "add") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });
    const result = await applyRoadmapConflictAutoRemedy(
      {
        cwd: "/repo",
        exec,
        writeFile: async (_path, content) => {
          writes.push(content);
        },
        captureIndexState: async () => ({
          indexFile,
          commit,
          rollback,
        }),
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "unmerged-only-roadmap" },
    );

    expect(result.status).toBe("applied");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("# Roadmap: Project Status");
    expect(candidateStaged).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("writes the regenerated ROADMAP and restages it when eligible", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const gitArgs: string[][] = [];

    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      gitArgs.push([...args]);
      if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
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
      {
        cwd: "/repo",
        exec,
        writeFile,
      },
      { eligible: false, reason: "wider-conflict" },
    );

    expect(result).toEqual({ status: "skipped", reason: "wider-conflict" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("returns failed when the worktree write throws", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (isStagedTransitionList(args)) return { stdout: "", stderr: "" };
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
      { eligible: true, trigger: "markers-only-roadmap" },
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
