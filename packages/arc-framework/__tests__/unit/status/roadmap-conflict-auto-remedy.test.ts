import { describe, it, expect, vi } from "vitest";

import {
  assessRoadmapConflictAutoRemedy,
  applyRoadmapConflictAutoRemedy,
  formatRoadmapConflictAutoRemedyMessage,
  type RoadmapConflictAutoRemedyAssessmentInput,
} from "../../../src/lib/status/roadmap-conflict-auto-remedy.js";
import { ROADMAP_PATH } from "../../../src/lib/status/roadmap-regeneration-assert.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";
import type { CanonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import type { GitMergeTransitionOverlayResult } from "../../../src/lib/work-unit/git-merge-transition-overlay.js";
import { createValidatedTransitionOverlay } from "../../../src/lib/work-unit/transition-overlay.js";

function isStagedReceiptList(args: readonly string[]): boolean {
  return args.join("\0") === [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=A",
    "-z",
    "--",
    ".arc/system/.internal/retirement-receipts",
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

async function absentTransition(): Promise<GitMergeTransitionOverlayResult> {
  return { status: "absent" };
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
  it("renders through selected finalized transition authority", async () => {
    const metaPath = ".arc/active/meta-origin.md";
    const siblingPath = ".arc/active/meta-sibling.md";
    const meta = [
      "# Metadata: origin",
      "",
      "- **State:** Active",
      "- **Owner:** andrew",
      "- **Branch:** plan/origin",
      "- **Priority:** P1",
      "- **Cohort:** [none]",
      "- **Depends On:** [none]",
      "",
      "---",
      "",
    ].join("\n");
    const siblingMeta = meta
      .replace("# Metadata: origin", "# Metadata: sibling")
      .replace("plan/origin", "feat/sibling");
    let written = "";
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (isStagedReceiptList(args)) return { stdout: "", stderr: "" };
      if (args[0] === "ls-files") return { stdout: "", stderr: "" };
      if (args[0] === "for-each-ref") return { stdout: "", stderr: "" };
      if (args[0] === "worktree") {
        return {
          stdout: [
            "worktree /tmp/origin",
            `HEAD ${"a".repeat(40)}`,
            "branch refs/heads/plan/origin",
            "",
            "worktree /tmp/sibling",
            `HEAD ${"b".repeat(40)}`,
            "branch refs/heads/feat/sibling",
          ].join("\n"),
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
        resolveTransitionOverlay: async (): Promise<GitMergeTransitionOverlayResult> => ({
          status: "selected",
          overlay: createValidatedTransitionOverlay({
            origin: "origin",
            sourceBranch: "plan/origin",
          }),
          receiptId: `sha256:${"b".repeat(64)}` as CanonicalDigest,
          provenance: [
            { kind: "candidate-tree" },
            { kind: "head", commitOid: "c".repeat(40) },
          ],
        }),
      },
      { eligible: true, trigger: "merge-staged-roadmap" },
    );

    expect(result.status).toBe("applied");
    expect(written).toMatch(/\| `Active` \| sibling\s+\|/u);
    expect(written).not.toMatch(/\| `Active` \| origin\s+\|/u);
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
      if (isStagedReceiptList(args)) return { stdout: "", stderr: "" };
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
    const resolveTransitionOverlay = vi.fn(async (): Promise<GitMergeTransitionOverlayResult> => {
      if (!candidateStaged) throw new Error("transition overlay resolved before ROADMAP was staged");
      return { status: "absent" };
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
        resolveTransitionOverlay,
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "unmerged-only-roadmap" },
    );

    expect(result.status).toBe("applied");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("# Roadmap: Project Status");
    expect(resolveTransitionOverlay).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("does not rewrite ROADMAP when merge transition authority is refused", async () => {
    const writeFile = vi.fn();
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (isStagedReceiptList(args)) return { stdout: "", stderr: "" };
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
        writeFile,
        resolveTransitionOverlay: async () => ({
          status: "refused",
          reason: "namespace-corrupt",
        }),
        baseBranch: "main",
        renderedRef: "fixed-stamp",
      },
      { eligible: true, trigger: "merge-staged-roadmap" },
    );

    expect(result).toEqual({
      status: "failed",
      message: "Merge transition authority was refused: namespace-corrupt",
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rolls back an alternate index when unmerged transition authority is refused", async () => {
    const head = "a".repeat(40);
    const indexFile = "/repo/.git/index.lock";
    const commit = vi.fn(async () => undefined);
    const rollback = vi.fn(async () => undefined);
    const writeFile = vi.fn();
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
            `100644 ${"b".repeat(40)} 1\t${ROADMAP_PATH}`,
            `100644 ${"c".repeat(40)} 2\t${ROADMAP_PATH}`,
            `100644 ${"d".repeat(40)} 3\t${ROADMAP_PATH}`,
            "",
          ].join("\0"),
          stderr: "",
        };
      }
      if (args[0] === "update-index") {
        if (options?.indexFile !== indexFile) {
          throw new Error("candidate ROADMAP staged outside alternate index");
        }
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

    const result = await applyRoadmapConflictAutoRemedy(
      {
        cwd: "/repo",
        exec,
        writeFile,
        captureIndexState: async () => ({
          indexFile,
          commit,
          rollback,
        }),
        resolveTransitionOverlay: async () => ({
          status: "refused",
          reason: "namespace-corrupt",
        }),
        baseBranch: "main",
      },
      { eligible: true, trigger: "unmerged-only-roadmap" },
    );

    expect(result).toEqual({
      status: "failed",
      message: "Merge transition authority was refused: namespace-corrupt",
    });
    expect(writeFile).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("writes the regenerated ROADMAP and restages it when eligible", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const gitArgs: string[][] = [];

    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      gitArgs.push([...args]);
      if (isStagedReceiptList(args)) return { stdout: "", stderr: "" };
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
        resolveTransitionOverlay: absentTransition,
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
        resolveTransitionOverlay: absentTransition,
      },
      { eligible: false, reason: "wider-conflict" },
    );

    expect(result).toEqual({ status: "skipped", reason: "wider-conflict" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("returns failed when the worktree write throws", async () => {
    const exec: GitExec = vi.fn(async (_cmd, args): Promise<ExecResult> => {
      if (isStagedReceiptList(args)) return { stdout: "", stderr: "" };
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
        resolveTransitionOverlay: absentTransition,
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
