/** The projection's ignore guard over real repositories. */
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { makeGitProcessError, type GitFailureEvidence } from "../../../helpers/git-exec-fake.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import type { GitExecInput } from "../../../../src/lib/git/exec.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { guardProjectionIgnores } from "../../../../src/lib/store/projection/ignore-guard.js";

const git = createExecaGitExec();
const execInput = createExecaGitExecInput();
const fs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
const identity = SlugSchema.parse("andrew");
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const EXCLUDE_LINES = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"];

async function repository(options: { exclude?: readonly string[]; gitignore?: readonly string[] } = {}): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-projection-guard-" });
  directories.push(cwd);
  await writeLines(cwd, ".git/info/exclude", options.exclude ?? EXCLUDE_LINES);
  await writeLines(cwd, ".gitignore", options.gitignore ?? [".arc/user/*/"]);
  return cwd;
}

async function writeLines(cwd: string, path: string, lines: readonly string[]): Promise<void> {
  await mkdir(dirname(join(cwd, path)), { recursive: true });
  await writeFile(join(cwd, path), lines.map((line) => `${line}\n`).join(""));
}

/** An excludes file outside the repository, set as `core.excludesFile`. */
async function excludesFile(cwd: string, directory: string, name: string, lines: readonly string[]): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-excludes-file-"));
  directories.push(parent);
  const path = join(parent, directory, name);
  await writeLines(parent, join(directory, name), lines);
  await git("git", ["config", "core.excludesFile", path], { cwd });
  return path;
}

function counted(): { exec: GitExecInput; calls: () => number } {
  let calls = 0;
  return { exec: async (args, input, options) => { calls += 1; return execInput(args, input, options); }, calls: () => calls };
}

it("passes in one call with every root ignored and the personal root ignored by .gitignore", async () => {
  const cwd = await repository();
  const io = counted();
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: io.exec, fs })).toMatchObject({ kind: "passed" });
  expect(io.calls()).toBe(1);
});

it("returns info/exclude and each .gitignore on the path to every root and the aside folder, absent ones included", async () => {
  const cwd = await repository();
  const verdict = await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs });
  expect(verdict.kind === "passed" ? [...verdict.ignoreFiles].sort() : verdict).toEqual([
    ".git/info/exclude", ".gitignore", ".arc/.gitignore", ".arc/user/.gitignore", ".arc/system/.gitignore",
    ".arc/system/.local/.gitignore",
  ].map((path) => join(cwd, path)).sort());
});

it("passes a root holding a tracked file where its rule exists", async () => {
  const cwd = await repository();
  await writeLines(cwd, ".arc/active/meta-a.md", ["# A"]);
  await git("git", ["add", "-f", ".arc/active/meta-a.md"], { cwd });
  await git("git", ["commit", "-m", "tracked"], { cwd });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({ kind: "passed" });
});

it("passes a root ignored only through core.excludesFile and returns that file", async () => {
  const cwd = await repository({ exclude: EXCLUDE_LINES.filter((line) => line !== ".arc/completed/") });
  const path = await excludesFile(cwd, "excludes", "ignore", [".arc/completed/"]);
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs }))
    .toMatchObject({ kind: "passed", ignoreFiles: expect.arrayContaining([path]) });
});

it("parses a core.excludesFile source whose path holds a colon intact", async () => {
  const cwd = await repository({ exclude: EXCLUDE_LINES.filter((line) => line !== ".arc/completed/") });
  // A Windows path already holds the drive's colon; a colon is not a legal file-name character there.
  const path = await excludesFile(cwd, process.platform === "win32" ? "excludes" : "ex:cludes", "ignore", [".arc/completed/"]);
  expect(path).toContain(":");
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs }))
    .toMatchObject({ kind: "passed", ignoreFiles: expect.arrayContaining([path]) });
});

it("refuses a root no rule ignores, naming its missing line, and passes once the line is added", async () => {
  const cwd = await repository({ exclude: EXCLUDE_LINES.filter((line) => line !== ".arc/backlog/") });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toEqual({
    kind: "refused", reason: "not-ignored",
    roots: [{ path: ".arc/backlog/", line: ".arc/backlog/", file: "info/exclude" }],
    remedy: expect.stringContaining("`.arc/backlog/`"),
  });
  await writeLines(cwd, ".git/info/exclude", EXCLUDE_LINES);
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({ kind: "passed" });
});

it("reads Git's exit status 1, with no root ignored, as a refusal naming every path", async () => {
  const cwd = await repository({ exclude: [], gitignore: [] });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({
    kind: "refused", reason: "not-ignored",
    roots: [
      { path: ".arc/active/", line: ".arc/active/", file: "info/exclude" },
      { path: ".arc/backlog/", line: ".arc/backlog/", file: "info/exclude" },
      { path: ".arc/completed/", line: ".arc/completed/", file: "info/exclude" },
      { path: ".arc/user/andrew/", line: ".arc/user/*/", file: ".gitignore" },
      { path: ".arc/system/.local/projection/", line: ".arc/system/.local/", file: "info/exclude" },
    ],
  });
});

it.each<[string, GitFailureEvidence]>([
  ["another exit status", { exitCode: 128, stderr: "fatal: bad config" }],
  ["a timeout", { timedOut: true }],
  ["a cancellation", { isCanceled: true }],
  ["a signal", { signal: "SIGKILL" }],
])("refuses every root on %s, naming the failure, and the next guard passes", async (_label, evidence) => {
  const cwd = await repository();
  const failure = makeGitProcessError({ command: "git", args: ["check-ignore"], ...evidence });
  let failed = false;
  const exec: GitExecInput = async (args, input, options) => {
    if (failed) return execInput(args, input, options);
    failed = true;
    throw failure;
  };
  expect(await guardProjectionIgnores({ root: cwd, identity, exec, fs })).toEqual({
    kind: "refused", reason: "guard-failed",
    paths: [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/user/andrew/", ".arc/system/.local/projection/"],
    failure: failure.message, remedy: expect.stringContaining("again"),
  });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec, fs })).toMatchObject({ kind: "passed" });
});

it("refuses a root a ! pattern re-includes as not ignored", async () => {
  const cwd = await repository({ gitignore: [".arc/user/*/", "!.arc/active/"] });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({
    kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/active/", line: ".arc/active/", file: "info/exclude" }],
  });
});

it("refuses the personal root ignored only from info/exclude, naming .gitignore, and passes once the line moves", async () => {
  const cwd = await repository({ exclude: [...EXCLUDE_LINES, ".arc/user/*/"], gitignore: [] });
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({
    kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/user/andrew/", line: ".arc/user/*/", file: ".gitignore" }],
    remedy: expect.stringContaining("`.arc/user/*/` to .gitignore"),
  });
  await writeLines(cwd, ".git/info/exclude", EXCLUDE_LINES);
  await writeLines(cwd, ".gitignore", [".arc/user/*/"]);
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({ kind: "passed" });
});

it.each([[".arc/.gitignore", "user/*/"], [".arc/user/.gitignore", "*/"]])(
  "passes the personal root ignored from %s on its path",
  async (path, line) => {
    const cwd = await repository({ gitignore: [] });
    await writeLines(cwd, path, [line]);
    expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs }))
      .toMatchObject({ kind: "passed", ignoreFiles: expect.arrayContaining([join(cwd, path)]) });
  },
);

it("refuses the personal root ignored only through a core.excludesFile named .gitignore outside the repository", async () => {
  const cwd = await repository({ gitignore: [] });
  await excludesFile(cwd, "home", ".gitignore", [".arc/user/*/"]);
  expect(await guardProjectionIgnores({ root: cwd, identity, exec: execInput, fs })).toMatchObject({
    kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/user/andrew/", line: ".arc/user/*/", file: ".gitignore" }],
  });
});
