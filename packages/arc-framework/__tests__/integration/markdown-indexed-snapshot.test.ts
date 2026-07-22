import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeGitExec } from "../helpers/integration.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import { loadIndexedMarkdownSnapshot } from "../../src/lib/markdown/indexed-snapshot.js";

const execFileAsync = promisify(execFile);

let root: string;
let linkedRoot: string | undefined;

async function write(path: string, content: string | Uint8Array): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-markdown-index-"));
  await execFileAsync("git", ["init", "-q"], { cwd: root });
});

afterEach(async () => {
  if (linkedRoot !== undefined) {
    await execFileAsync("git", ["worktree", "remove", "--force", linkedRoot], { cwd: root }).catch(() => undefined);
    await rm(linkedRoot, { recursive: true, force: true });
    linkedRoot = undefined;
  }
  await rm(root, { recursive: true, force: true });
});

describe("indexed Markdown snapshot", () => {
  it("loads the complete selected index once without consulting divergent worktree bytes", async () => {
    await write("README.md", "# Indexed\n");
    await write("docs/guide.md", "# Guide\n");
    await write(".arc/completed/old.md", "# Excluded\n");
    await execFileAsync("git", ["add", "--all"], { cwd: root });
    await write("README.md", "# Worktree\n");

    const readBlob = vi.fn((cwd: string, path: string) => readGitBlobBytes(cwd, null, path));
    const snapshot = await loadIndexedMarkdownSnapshot({
      root,
      exec: makeGitExec(root),
      readBlob,
    });

    expect([...snapshot]).toEqual([
      ["README.md", "# Indexed\n"],
      ["docs/guide.md", "# Guide\n"],
    ]);
    expect(readBlob.mock.calls.map(([, path]) => path)).toEqual(["README.md", "docs/guide.md"]);
  });

  it("rejects invalid UTF-8 from the index even when the worktree replacement is valid", async () => {
    await write("broken.md", Uint8Array.from([0xc3, 0x28]));
    await execFileAsync("git", ["add", "broken.md"], { cwd: root });
    await write("broken.md", "# Valid worktree replacement\n");

    await expect(loadIndexedMarkdownSnapshot({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
    })).rejects.toThrow("Indexed Markdown is not valid UTF-8: broken.md");
  });

  it("fails instead of substituting another reader when an enumerated blob is missing", async () => {
    await write("README.md", "# Indexed\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    const readBlob = vi.fn(async () => null);

    await expect(loadIndexedMarkdownSnapshot({
      root,
      exec: makeGitExec(root),
      readBlob,
    })).rejects.toThrow("Indexed Markdown blob is missing: README.md");
    expect(readBlob).toHaveBeenCalledTimes(1);
  });

  it("tracks index deletion and rename states with spaces and unusual names", async () => {
    await write("delete me.md", "# Delete\n");
    await write("rename me.md", "# Rename\n");
    await execFileAsync("git", ["add", "--all"], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=ARC", "-c", "user.email=arc@example.com", "commit", "-qm", "seed"], {
      cwd: root,
    });

    await execFileAsync("git", ["rm", "delete me.md"], { cwd: root });
    await execFileAsync("git", ["mv", "rename me.md", "renamed\nfile.md"], { cwd: root });

    const snapshot = await loadIndexedMarkdownSnapshot({
      root,
      exec: makeGitExec(root),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
    });
    expect([...snapshot]).toEqual([["renamed\nfile.md", "# Rename\n"]]);
  });

  it("loads the independent index owned by a linked worktree", async () => {
    await write("README.md", "# Main index\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: root });
    await execFileAsync("git", ["-c", "user.name=ARC", "-c", "user.email=arc@example.com", "commit", "-qm", "seed"], {
      cwd: root,
    });
    linkedRoot = `${root}-linked`;
    await execFileAsync("git", ["worktree", "add", "--detach", "-q", linkedRoot], { cwd: root });
    await writeFile(join(linkedRoot, "README.md"), "# Linked index\n");
    await execFileAsync("git", ["add", "README.md"], { cwd: linkedRoot });

    const snapshot = await loadIndexedMarkdownSnapshot({
      root: linkedRoot,
      exec: makeGitExec(linkedRoot),
      readBlob: (cwd, path) => readGitBlobBytes(cwd, null, path),
    });
    expect([...snapshot]).toEqual([["README.md", "# Linked index\n"]]);
  });
});
