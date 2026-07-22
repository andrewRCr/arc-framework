import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import {
  enumerateStagedMarkdownGatePaths,
  isMarkdownGateTriggerPath,
} from "../../src/lib/markdown/staged-gate.js";

const execFileAsync = promisify(execFile);

let root: string;
let linkedRoot: string | undefined;

async function write(path: string, content: string): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function commitSeed(): Promise<void> {
  await execFileAsync("git", ["add", "--all"], { cwd: root });
  await execFileAsync("git", ["-c", "user.name=ARC", "-c", "user.email=arc@example.com", "commit", "-qm", "seed"], {
    cwd: root,
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-staged-gate-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await write("delete me.md", "# Delete\n");
  await write("rename me.md", "# Rename\n");
  await write("notes.txt", "notes\n");
  await commitSeed();
});

afterEach(async () => {
  if (linkedRoot !== undefined) {
    await execFileAsync("git", ["worktree", "remove", "--force", linkedRoot], { cwd: root }).catch(() => undefined);
    await rm(linkedRoot, { recursive: true, force: true });
    linkedRoot = undefined;
  }
  await rm(root, { recursive: true, force: true });
});

describe("staged Markdown path detection", () => {
  it("retains both sides of deletion and rename changes with unusual names", async () => {
    await execFileAsync("git", ["rm", "delete me.md"], { cwd: root });
    await execFileAsync("git", ["mv", "rename me.md", "renamed\nfile.md"], { cwd: root });

    const paths = await enumerateStagedMarkdownGatePaths(root, makeGitExec(root));
    expect(paths).toEqual(["delete me.md", "rename me.md", "renamed\nfile.md"]);
    expect(paths.every(isMarkdownGateTriggerPath)).toBe(true);
  });

  it("detects the staged side of a partially staged Markdown file", async () => {
    await write("partial file.md", "staged\n");
    await execFileAsync("git", ["add", "partial file.md"], { cwd: root });
    await write("partial file.md", "unstaged\n");

    await expect(enumerateStagedMarkdownGatePaths(root, makeGitExec(root))).resolves.toEqual(["partial file.md"]);
  });

  it("reads the independent index of a linked worktree", async () => {
    linkedRoot = `${root}-linked`;
    await execFileAsync("git", ["worktree", "add", "--detach", "-q", linkedRoot], { cwd: root });
    await writeFile(join(linkedRoot, "linked path.md"), "# Linked\n");
    await execFileAsync("git", ["add", "linked path.md"], { cwd: linkedRoot });

    await expect(enumerateStagedMarkdownGatePaths(linkedRoot, makeGitExec(linkedRoot))).resolves.toEqual([
      "linked path.md",
    ]);
  });
});
