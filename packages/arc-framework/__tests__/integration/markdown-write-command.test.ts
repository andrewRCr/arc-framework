import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { atomicWriteFile } from "../../src/lib/fs.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createAtomicMarkdownPlanWriter } from "../../src/lib/markdown/index.js";
import { runMarkdownWriteCommand } from "../../src/scripts/markdown-write-command.js";

const execFileAsync = promisify(execFile);

let fixtureParent: string;
let primary: string;
let linked: string;

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const target = join(root, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function commandDependencies() {
  return {
    exec: createExecaGitExec(),
    lstat,
    realpath,
    readText: (path: string) => readFile(path, "utf8"),
    readBytes: (path: string) => readFile(path),
    writer: createAtomicMarkdownPlanWriter,
  };
}

beforeEach(async () => {
  fixtureParent = await mkdtemp(join(tmpdir(), "arc-markdown-write-"));
  primary = join(fixtureParent, "primary");
  linked = join(fixtureParent, "linked");
  await mkdir(primary);
  await git(primary, ["init", "-q", "-b", "main"]);
  await git(primary, ["config", "user.email", "test@example.com"]);
  await git(primary, ["config", "user.name", "Test User"]);
  await writeFixtureFile(primary, "packages/arc-framework/init-recipe.json", JSON.stringify({
    prompts: [],
    include_files: [],
    conditions: {},
  }));
  await writeFixtureFile(primary, ".arc/system/.internal/manifest.json", JSON.stringify({
    schema_version: 1,
    framework_version: "test",
    installed_at: "2026-07-20",
    install_config: { project_name: "Demo", pm_mode: "arc-in-git", tools: [] },
    files: {},
  }));
  await writeFixtureFile(primary, "docs/a.md", "| A |\n| - |\n| 表 |\n");
  await writeFixtureFile(primary, "docs/b.md", "| Name | Value |\n| - | - |\n| é | 👩‍💻 |\n");
  await git(primary, ["add", "--all"]);
  await git(primary, ["commit", "-q", "-m", "fixture"]);
  await git(primary, ["worktree", "add", "-q", "-b", "linked-test", linked]);
  await mkdir(join(linked, "nested", "cwd"), { recursive: true });
});

afterEach(async () => {
  await rm(fixtureParent, { recursive: true, force: true });
});

describe("Markdown write command", () => {
  it("formats multiple files from a linked-worktree subdirectory and reruns as a no-op", async () => {
    const originalPrimary = await readFile(join(primary, "docs/a.md"), "utf8");
    const paths = ["docs/a.md", "docs/b.md"];
    const first = await runMarkdownWriteCommand(
      "format-tables",
      join(linked, "nested", "cwd"),
      paths,
      commandDependencies(),
    );

    expect(first.failure).toBeUndefined();
    expect(first.result.writeStatus).toBe("complete");
    expect(first.result.files.every(({ write }) => write === "written")).toBe(true);
    expect(await readFile(join(primary, "docs/a.md"), "utf8")).toBe(originalPrimary);
    expect(await readFile(join(linked, "docs/a.md"), "utf8")).not.toBe(originalPrimary);
    expect((await readdir(join(linked, "docs"))).some((entry) => entry.endsWith(".tmp"))).toBe(false);

    const second = await runMarkdownWriteCommand(
      "format-tables",
      join(linked, "nested", "cwd"),
      paths,
      commandDependencies(),
    );
    expect(second.result.writeStatus).toBe("none");
    expect(second.result.files.every(({ write }) => write === "unchanged")).toBe(true);
  });

  it("validates the complete selection before writing any earlier valid file", async () => {
    await writeFixtureFile(linked, "docs/untracked.md", "| X |\n| - |\n| 表 |\n");
    const before = await readFile(join(linked, "docs/a.md"), "utf8");

    await expect(runMarkdownWriteCommand(
      "format-tables",
      linked,
      ["docs/a.md", "docs/untracked.md"],
      commandDependencies(),
    )).rejects.toMatchObject({ code: "markdown.untracked" });
    expect(await readFile(join(linked, "docs/a.md"), "utf8")).toBe(before);
    expect((await readdir(join(linked, "docs"))).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });

  it("cleans the same-directory temporary file when atomic replacement fails", async () => {
    const target = join(linked, "docs", "replacement-target");
    await mkdir(target);

    await expect(atomicWriteFile(target, new TextEncoder().encode("bytes"))).rejects.toBeDefined();

    const prefix = `.${basename(target)}.`;
    expect((await readdir(join(linked, "docs"))).some((entry) => entry.startsWith(prefix) && entry.endsWith(".tmp")))
      .toBe(false);
  });
});
