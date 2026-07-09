import { describe, it, expect, vi } from "vitest";

import {
  ROADMAP_RERENDER_COMMAND,
  assertRoadmapRegenerated,
  createIndexProjectViewFs,
  renderRoadmapFromIndex,
  type RoadmapRegenerationAssertVerdict,
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

function makeIndexExec(files: Record<string, string>): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
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
      if (!target.startsWith(":")) throw new Error(`unexpected show target: ${target}`);
      const path = target.slice(1);
      const content = files[path];
      if (content === undefined) throw new Error(`missing index file: ${path}`);
      return { stdout: content, stderr: "" };
    }
    if (args[0] === "for-each-ref" || args[0] === "worktree") {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  });
}

function messageFor(
  verdict: RoadmapRegenerationAssertVerdict,
  status: Exclude<RoadmapRegenerationAssertVerdict["status"], "pass">,
): string {
  expect(verdict.status).toBe(status);
  if (verdict.status === "pass") throw new Error("expected a diagnostic verdict");
  return verdict.message;
}

describe("assertRoadmapRegenerated", () => {
  it("rejects a determinate mismatch with the re-render instruction", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "hand edit\n",
      renderedContent: "rendered\n",
      indeterminate: false,
    });

    expect(messageFor(verdict, "reject-mismatch")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("rejects conflict markers even when the render is indeterminate", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n",
      renderedContent: "rendered\n",
      indeterminate: true,
    });

    expect(messageFor(verdict, "reject-markers")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("warns and allows an indeterminate mismatch", () => {
    const verdict = assertRoadmapRegenerated({
      stagedContent: "staged\n",
      renderedContent: "rendered\n",
      indeterminate: true,
    });

    expect(messageFor(verdict, "warn-and-allow")).toContain(ROADMAP_RERENDER_COMMAND);
  });

  it("passes byte-identical content", () => {
    expect(assertRoadmapRegenerated({
      stagedContent: "rendered\n",
      renderedContent: "rendered\n",
      indeterminate: false,
    })).toEqual({ status: "pass" });
  });
});

describe("createIndexProjectViewFs", () => {
  it("lists and reads meta files from the staged index", async () => {
    const exec = makeIndexExec({
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });
    const fs = createIndexProjectViewFs({ cwd: "/repo", exec });

    const entries = await fs.readdir("/repo/.arc/backlog/planned");
    const ready = entries.find((entry) => entry.name === "ready");

    expect(ready?.isDirectory()).toBe(true);
    await expect(fs.readFile("/repo/.arc/backlog/planned/ready/meta-ready.md")).resolves.toContain("P1");
    expect(exec).toHaveBeenCalledWith("git", [
      "show",
      ":.arc/backlog/planned/ready/meta-ready.md",
    ], { cwd: "/repo" });
  });
});

describe("renderRoadmapFromIndex", () => {
  it("passes when staged ROADMAP content matches the index-pinned render", async () => {
    const exec = makeIndexExec({
      ".arc/backlog/planned/ready/meta-ready.md": meta("ready", { priority: "P1" }),
    });
    const rendered = await renderRoadmapFromIndex({
      cwd: "/repo",
      exec,
      baseBranch: "main",
      renderedRef: "abc1234",
    });

    const verdict = assertRoadmapRegenerated({
      stagedContent: rendered,
      renderedContent: rendered,
      indeterminate: false,
    });

    expect(verdict.status).toBe("pass");
    expect(rendered).toMatch(/\| ready\s+\| P1\s+\|/);
  });
});
