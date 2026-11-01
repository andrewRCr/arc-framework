/** The ignore check over real repositories: an ignore file edited while the guard's call reads is never a pass's baseline. */
import { appendFile, lstat, mkdir, mkdtemp, readFile, realpath, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import type { GitExecInput } from "../../../../src/lib/git/exec.js";
import { createExecaGitExec, createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { checkIgnores } from "../../../../src/lib/store/projection/ignore-check.js";

const git = createExecaGitExec();
const execInput = createExecaGitExecInput();
const fs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
const identity = SlugSchema.parse("andrew");
const EXCLUDE_LINES = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"];
const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function repository(): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-projection-ignore-check-" });
  directories.push(cwd);
  await writeLines(join(cwd, ".git/info/exclude"), EXCLUDE_LINES);
  await writeLines(join(cwd, ".gitignore"), [".arc/user/*/"]);
  return cwd;
}

async function writeLines(path: string, lines: readonly string[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, lines.map((line) => `${line}\n`).join(""));
}

/** A Git boundary that runs the real call, then does `after` once Git has read the ignore files, on the calls it names. */
function editingAfter(calls: (call: number) => boolean, after: () => Promise<void>): GitExecInput {
  let call = 0;
  return async (args, input, options) => {
    call += 1;
    const stdout = await execInput(args, input, options);
    if (calls(call)) await after();
    return stdout;
  };
}

it("never records a pass over an ignore line removed while the call read, reading again and refusing that root", async () => {
  const cwd = await repository();
  const exec = editingAfter((call) => call === 1, async () => {
    await writeLines(join(cwd, ".git/info/exclude"), EXCLUDE_LINES.filter((line) => line !== ".arc/backlog/"));
  });
  const checked = await checkIgnores({ guard: { root: cwd, identity, exec, fs }, records: null, reference: null, format: "sha1" });
  expect(checked).toMatchObject({ kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/backlog/" }] });
});

it("reads again where the call names an excludes file the last pass did not, edited while the call read", async () => {
  const cwd = await repository();
  await writeLines(join(cwd, ".git/info/exclude"), EXCLUDE_LINES.filter((line) => line !== ".arc/completed/"));
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-ignore-check-excludes-"));
  directories.push(parent);
  const excludes = join(parent, "ignore");
  await writeLines(excludes, [".arc/completed/"]);
  await git("git", ["config", "core.excludesFile", excludes], { cwd });
  const exec = editingAfter((call) => call === 1, async () => { await writeLines(excludes, []); });
  const checked = await checkIgnores({ guard: { root: cwd, identity, exec, fs }, records: null, reference: null, format: "sha1" });
  expect(checked).toMatchObject({ kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/completed/" }] });
});

it("fails closed, refusing every root with the remedy of running again, where an ignore file changes on every read", async () => {
  const cwd = await repository();
  let edits = 0;
  const exec = editingAfter(() => true, async () => {
    edits += 1;
    await appendFile(join(cwd, ".git/info/exclude"), `# edit ${edits}\n`);
  });
  const checked = await checkIgnores({ guard: { root: cwd, identity, exec, fs }, records: null, reference: null, format: "sha1" });
  expect(checked).toMatchObject({ kind: "refused", reason: "guard-failed", remedy: expect.stringContaining("run the command again") });
});

it("makes one call where the last pass named every source, a core.excludesFile among them", async () => {
  const cwd = await repository();
  await writeLines(join(cwd, ".git/info/exclude"), EXCLUDE_LINES.filter((line) => line !== ".arc/completed/"));
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-ignore-check-excludes-"));
  directories.push(parent);
  const excludes = join(parent, "ignore");
  await writeLines(excludes, [".arc/completed/"]);
  await git("git", ["config", "core.excludesFile", excludes], { cwd });
  const first = await checkIgnores({ guard: { root: cwd, identity, exec: execInput, fs }, records: null, reference: null, format: "sha1" });
  if (first.kind !== "passed") throw new Error("expected the first check to pass");
  await appendFile(join(cwd, ".git/info/exclude"), "# a comment\n");
  let calls = 0;
  const once: GitExecInput = async (args, input, options) => {
    calls += 1;
    if (calls > 1) throw new Error("a second Git call");
    return execInput(args, input, options);
  };
  const again = await checkIgnores({ guard: { root: cwd, identity, exec: once, fs }, records: first.records, reference: null, format: "sha1" });
  expect(again.kind).toBe("passed");
});

it("reads again where an edit while the call read kept the file's size and modification time", async () => {
  const cwd = await repository();
  const exclude = join(cwd, ".git/info/exclude");
  // A whole second, which setting the time back restores exactly.
  const time = 1_700_000_000;
  await utimes(exclude, time, time);
  const exec = editingAfter((call) => call === 1, async () => {
    // The same length, and the time set back, as a tool that preserves it writes.
    await writeFile(exclude, (await readFile(exclude, "utf8")).replace(".arc/backlog/", "#arc/backlog/"), { flag: "r+" });
    await utimes(exclude, time, time);
  });
  const checked = await checkIgnores({ guard: { root: cwd, identity, exec, fs }, records: null, reference: null, format: "sha1" });
  expect(checked).toMatchObject({ kind: "refused", reason: "not-ignored", roots: [{ path: ".arc/backlog/" }] });
});
