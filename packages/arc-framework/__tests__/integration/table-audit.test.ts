import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import { prepareTableMigrationAudit, transformGfmTables } from "../../src/lib/markdown/index.js";

const execFileAsync = promisify(execFile);
let root: string | undefined;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("table migration audit against Git", () => {
  it("loads one exact HEAD baseline and reproduces evidence across retries", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-table-audit-"));
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test User"]);
    const path = "docs/table.md";
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    const baseline = new TextEncoder().encode("Before\n\n| A |\n| - |\n| 表 |\n");
    await writeFile(target, baseline);
    await git(root, ["add", path]);
    await git(root, ["commit", "-q", "-m", "baseline"]);
    const head = await git(root, ["rev-parse", "HEAD"]);
    const transformed = transformGfmTables({ path, bytes: baseline });
    await writeFile(target, transformed.bytes);
    const options = {
      root,
      paths: [path],
      exec: createExecaGitExec(),
      lstat,
      realpath,
      readBaseline: (ref: string, selectedPath: string) => readGitBlobBytes(root as string, ref, selectedPath),
      readBytes: (selectedPath: string) => readFile(join(root as string, selectedPath)),
    };

    const first = await prepareTableMigrationAudit(options);
    const second = await prepareTableMigrationAudit(options);
    const selected = await prepareTableMigrationAudit({
      root,
      exec: options.exec,
      lstat,
      realpath,
      readBaseline: options.readBaseline,
      readBytes: options.readBytes,
    });

    expect(first).toEqual({
      head,
      files: [{ path, changedRanges: transformed.changedRanges }],
    });
    expect(second).toEqual(first);
    expect(selected).toEqual(first);
  });

  it("reads an untracked path identically in explicit and automatic selection", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-table-audit-untracked-"));
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test User"]);
    await writeFile(join(root, "tracked.md"), "# Tracked\n");
    await git(root, ["add", "tracked.md"]);
    await git(root, ["commit", "-q", "-m", "baseline"]);
    const head = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["rm", "--cached", "tracked.md"]);
    const options = {
      root,
      exec: createExecaGitExec(),
      lstat,
      realpath,
      readBaseline: (ref: string, path: string) => readGitBlobBytes(root as string, ref, path),
      readBytes: (path: string) => readFile(join(root as string, path)),
    };

    const automatic = await prepareTableMigrationAudit(options);
    const explicit = await prepareTableMigrationAudit({ ...options, paths: ["tracked.md"] });
    expect(explicit).toEqual({ head, files: [{ path: "tracked.md", changedRanges: [] }] });
    expect(explicit).toEqual(automatic);
  });
});
