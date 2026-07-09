import { describe, it, expect, vi } from "vitest";

import {
  runRoadmapRegenerationAssert,
} from "../../../src/scripts/assert-roadmap-regenerated.js";
import {
  ROADMAP_PATH,
  ROADMAP_RERENDER_COMMAND,
  renderRoadmapFromIndex,
} from "../../../src/lib/status/roadmap-regeneration-assert.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

function meta(slug: string, fields: { priority?: string } = {}): string {
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`Planning\` | \`andrew\` | [none] | \`Heavy\` | \`${fields.priority ?? "P3"}\` |`,
    "",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

function oracleMeta(branch: string): string {
  return [
    "# Metadata: moving",
    "",
    "- **State:** Active",
    "- **Owner:** andrew",
    `- **Branch:** ${branch}`,
    "- **Priority:** P1",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "---",
  ].join("\n");
}

function makeIndexExec(
  files: Record<string, string>,
  opts: {
    movingRef?: boolean;
    stagedRoadmap?: boolean;
  } = {},
): GitExec {
  let refReads = 0;
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "diff") {
      return { stdout: opts.stagedRoadmap === false ? "" : `${ROADMAP_PATH}\n`, stderr: "" };
    }
    if (args[0] === "ls-files") {
      const dir = args.at(-1) ?? "";
      const lines = Object.keys(files)
        .filter((path) => path === dir || path.startsWith(`${dir}/`))
        .sort()
        .map((path) => `100644 object-id 0\t${path}`);
      return { stdout: lines.join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const target = args[1] ?? "";
      if (target.startsWith(":")) {
        const path = target.slice(1);
        const content = files[path];
        if (content === undefined) throw new Error(`missing index file: ${path}`);
        return { stdout: content, stderr: "" };
      }
      if (target === "feat/moving:.arc/active/meta-moving.md") {
        return { stdout: oracleMeta("feat/moving"), stderr: "" };
      }
    }
    if (args[0] === "for-each-ref") {
      if (!opts.movingRef) return { stdout: "", stderr: "" };
      refReads += 1;
      return {
        stdout: `refs/heads/feat/moving\t${refReads === 1 ? "1111111" : "2222222"}`,
        stderr: "",
      };
    }
    if (args[0] === "worktree") {
      if (!opts.movingRef) return { stdout: "", stderr: "" };
      return {
        stdout: [
          "worktree /repo",
          "HEAD 1111111111111111111111111111111111111111",
          "branch refs/heads/feat/moving",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "ls-tree") {
      return { stdout: opts.movingRef ? ".arc/active/meta-moving.md" : "", stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

describe("runRoadmapRegenerationAssert", () => {
  it("rejects a staged ROADMAP mismatch", async () => {
    const exec = makeIndexExec({
      [ROADMAP_PATH]: "hand edit\n",
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });

    const result = await runRoadmapRegenerationAssert({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
      stagedPaths: [ROADMAP_PATH],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(ROADMAP_RERENDER_COMMAND);
    expect(result.stdout).toBe("");
  });

  it("rejects surviving conflict markers", async () => {
    const exec = makeIndexExec({
      [ROADMAP_PATH]: "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n",
    });

    const result = await runRoadmapRegenerationAssert({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
      stagedPaths: [ROADMAP_PATH],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("conflict markers");
    expect(result.stderr).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("passes silently when staged content is byte-identical to the index render", async () => {
    const files = {
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
      [ROADMAP_PATH]: "",
    };
    const exec = makeIndexExec(files);
    files[ROADMAP_PATH] = await renderRoadmapFromIndex({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
    });

    const result = await runRoadmapRegenerationAssert({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
      stagedPaths: [ROADMAP_PATH],
    });

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it("warns and allows an indeterminate mismatch", async () => {
    const exec = makeIndexExec({
      [ROADMAP_PATH]: "hand edit\n",
    }, { movingRef: true });

    const result = await runRoadmapRegenerationAssert({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
      stagedPaths: [ROADMAP_PATH],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("indeterminate");
    expect(result.stdout).toContain(ROADMAP_RERENDER_COMMAND);
    expect(result.stderr).toBe("");
  });

  it("stays silent when ROADMAP is not staged", async () => {
    const exec = vi.fn<GitExec>();

    await expect(runRoadmapRegenerationAssert({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
      stagedPaths: [],
    })).resolves.toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(exec).not.toHaveBeenCalled();
  });
});
