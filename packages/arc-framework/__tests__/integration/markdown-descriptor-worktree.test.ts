import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import {
  runWorktreeTaskDescriptorLint,
  selectTaskDescriptorPaths,
} from "../../src/lib/markdown/descriptor-worktree.js";
import { main as lintTaskDescriptors } from "../../src/scripts/lint-task-descriptors.js";

const execFileAsync = promisify(execFile);

let root: string;

async function write(path: string, content: string): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function invalidTask(id: string): string {
  return [
    `### \`[ ]\` **${id} Invalid spacing**`,
    "",
    "- _Goal:_ This descriptor wraps onto",
    "  a second physical line.",
    "- _Context:_ This pair needs a separator.",
  ].join("\n");
}

function validTask(id: string): string {
  return [
    "## **Phase 1:** Build",
    "",
    `### \`[ ]\` **${id} Build the behavior**`,
    "",
    "- _Goal:_ Build the behavior.",
    "",
    "## **Phase 2:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
  ].join("\n");
}

function invalidSegmentationTask(): string {
  return [
    "## **Phase 1:** Build",
    "",
    "_Mode:_ `layer` — closes on settled structure.",
    "",
    "### `[ ]` **1.1 Build the structure**",
    "",
    "- _Goal:_ Build the structure.",
    "",
    "## **Phase 2:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
  ].join("\n");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-descriptor-worktree-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await write(".arc/active/tasks-b.md", invalidTask("2.1"));
  await write("planning/tasks-a.md", invalidTask("1.1"));
  await write(".arc/completed/2026/tasks-old.md", invalidTask("9.1"));
  await write(
    "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md",
    "```markdown\n### `[ ]` **3.1 Fenced example**\n```\n",
  );
  await write("README.md", "# Fixture\n");
  await execFileAsync("git", ["add", "--all"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("worktree task descriptor lint", () => {
  it("selects the task-list subset from the shared Markdown scope", () => {
    expect(selectTaskDescriptorPaths([
      ".arc/active/tasks-b.md",
      "planning/tasks-a.md",
      ".arc/completed/2026/tasks-old.md",
      "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md",
      "README.md",
    ])).toEqual([
      ".arc/active/tasks-b.md",
      "planning/tasks-a.md",
      "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md",
    ]);
  });

  it("loads the selected worktree files and aggregates every diagnostic", async () => {
    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.paths).toEqual([
      ".arc/active/tasks-b.md",
      "packages/arc-framework/arc/reference/templates/arc/work-unit/template-tasks.md",
      "planning/tasks-a.md",
    ]);
    expect(result.diagnostics.map(({ path, line }) => `${path}:${line}`)).toEqual([
      ".arc/active/tasks-b.md:5",
      "planning/tasks-a.md:5",
    ]);
  });

  it("returns a failing worktree result for a selected segmentation defect", async () => {
    await write(".arc/active/tasks-b.md", validTask("1.1"));
    await write("planning/tasks-a.md", validTask("1.2"));
    await write(".arc/active/tasks-segmented.md", invalidSegmentationTask());

    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.diagnostics).toEqual([{
      path: ".arc/active/tasks-segmented.md",
      line: 1,
      message: ".arc/active/tasks-segmented.md:1: Segment closing at Phase 1 has no _Exit criterion:_",
    }]);
    expect(await lintTaskDescriptors(root)).toBe(1);
  });

  it("returns a failing worktree result for an anonymous task-body checkbox", async () => {
    await write(".arc/active/tasks-b.md", [
      "### `[ ]` **1.1 Active parent**",
      "",
      "- `[ ]` Unnumbered follow-up",
    ].join("\n"));
    await write("planning/tasks-a.md", validTask("1.2"));

    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.diagnostics).toEqual([{
      path: ".arc/active/tasks-b.md",
      line: 3,
      message: ".arc/active/tasks-b.md:3: Task-list structure is malformed: anonymous checkbox at line 3 appears inside parent task 1.1 at line 1",
    }]);
    expect(await lintTaskDescriptors(root)).toBe(1);
  });

  it("adds no segmentation finding for a valid unsegmented task list", async () => {
    await write(".arc/active/tasks-b.md", validTask("1.1"));
    await write("planning/tasks-a.md", validTask("1.2"));

    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("does not scan segmentation under an excluded completed path", async () => {
    await write(".arc/active/tasks-b.md", validTask("1.1"));
    await write("planning/tasks-a.md", validTask("1.2"));
    await write(".arc/completed/2026/tasks-old.md", invalidSegmentationTask());

    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.diagnostics).toEqual([]);
  });

  it("orders descriptor and segmentation diagnostics in one result", async () => {
    await write(".arc/active/tasks-b.md", invalidSegmentationTask());

    const result = await runWorktreeTaskDescriptorLint({
      root,
      exec: makeGitExec(root),
      readText: (path) => readFile(path, "utf8"),
    });

    expect(result.diagnostics.map(({ path, line }) => `${path}:${line}`)).toEqual([
      ".arc/active/tasks-b.md:1",
      "planning/tasks-a.md:5",
    ]);
  });
});
