import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/promise";
import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import { prepareEmphasisMigrationAudit } from "../../src/lib/markdown/index.js";

const execFileAsync = promisify(execFile);
const emphasisConfig = {
  default: false,
  MD049: { style: "underscore" },
  MD050: { style: "asterisk" },
} as const;
let root: string | undefined;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout.trim();
}

async function fixEmphasis(path: string, content: string): Promise<string> {
  const results = await lint({ strings: { [path]: content }, config: emphasisConfig });
  return applyFixes(content, results[path] ?? []);
}

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("emphasis migration audit against Git", () => {
  it("reproduces exact evidence and proves the pinned fixer is idempotent", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-emphasis-audit-"));
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test User"]);
    const path = "docs/emphasis.md";
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    const baseline = "*italic*, __strong__, and ***nested***; keep `*code*`, \\*escaped\\*, and word*mark*word.\n";
    await writeFile(target, baseline);
    await git(root, ["add", path]);
    await git(root, ["commit", "-q", "-m", "baseline"]);
    const head = await git(root, ["rev-parse", "HEAD"]);
    const candidate = await fixEmphasis(path, baseline);
    await writeFile(target, candidate);
    const options = {
      root,
      paths: [path],
      exec: createExecaGitExec(),
      lstat,
      realpath,
      readBaseline: (ref: string, selectedPath: string) => readGitBlobBytes(root as string, ref, selectedPath),
      readBytes: (selectedPath: string) => readFile(join(root as string, selectedPath)),
    };

    const first = await prepareEmphasisMigrationAudit(options);
    const second = await prepareEmphasisMigrationAudit(options);

    expect(first).toEqual({ head, files: [{ path, changedDelimiters: 8 }] });
    expect(second).toEqual(first);
    expect(await fixEmphasis(path, candidate)).toBe(candidate);
  });

  it("refuses an explicit untracked file before reading a baseline", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-emphasis-audit-untracked-"));
    await git(root, ["init", "-q", "-b", "main"]);
    await git(root, ["config", "user.email", "test@example.com"]);
    await git(root, ["config", "user.name", "Test User"]);
    await writeFile(join(root, "tracked.md"), "# Tracked\n");
    await git(root, ["add", "tracked.md"]);
    await git(root, ["commit", "-q", "-m", "baseline"]);
    await writeFile(join(root, "untracked.md"), "# Untracked\n");

    await expect(prepareEmphasisMigrationAudit({
      root,
      paths: ["untracked.md"],
      exec: createExecaGitExec(),
      lstat,
      realpath,
      readBaseline: (ref, path) => readGitBlobBytes(root as string, ref, path),
      readBytes: (path) => readFile(join(root as string, path)),
    })).rejects.toMatchObject({ code: "markdown.untracked" });
  });
});
