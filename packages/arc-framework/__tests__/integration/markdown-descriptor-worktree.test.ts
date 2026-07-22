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
    expect(result.diagnostics.map(({ path, parent }) => `${path}:${parent.id}`)).toEqual([
      ".arc/active/tasks-b.md:2.1",
      "planning/tasks-a.md:1.1",
    ]);
  });
});
