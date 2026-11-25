/** Exact fix-corpus selection and real file mutation through repository boundaries. */
import { lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execa } from "execa";
import { afterEach, expect, it, vi } from "vitest";
import { createRawGitExec, gitExec } from "../../src/lib/io-context.js";
import { prepareMarkdownFix, resolveMarkdownFixCorpus, type MarkdownFixIO } from "../../src/lib/markdown/fix-plan.js";
import { MARKDOWN_SELECTION } from "../../src/lib/markdown/selection.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runMarkdownFix } from "../../src/lib/markdown/fix.js";
import { batchCheckPaths } from "../../src/lib/checks/batching.js";
import { main } from "../../src/scripts/fix-markdown.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await removeGitBackedDirs(roots.splice(0)); });
async function write(root: string, path: string, content = "# Fixture\n"): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
async function fixture(paths: readonly string[] = []) {
  const root = await createTempRepoCore({ prefix: "arc-markdown-fix-" });
  roots.push(root);
  await write(root, ".markdownlint-cli2.jsonc", JSON.stringify({ config: { default: true }, ...MARKDOWN_SELECTION }));
  await write(root, ".git/info/exclude", ".arc/active/\n.arc/completed/\n.arc/user/\nignored.md\n");
  await write(root, "tracked.md");
  await write(root, "missing.md");
  await symlink(resolve(import.meta.dirname, "../../../../node_modules"), join(root, "node_modules"), "junction");
  await execa("git", ["add", "--all"], { cwd: root });
  await execa("git", ["commit", "-qm", "fix corpus"], { cwd: root });
  const io: MarkdownFixIO = { exec: gitExec, rawGit: createRawGitExec(root), lstat, realpath,
    readText: path => readFile(path, "utf8"), readProjectedSelection: async (_root, options) => {
      expect(options.changed).toBe(false);
      return { status: "ok", paths };
    } };
  return { root, io };
}

it("unions present Git and full projected paths with canonical exclusions and literal deduplication", async () => {
  const projected = ".arc/active/current/[literal] # notes.md";
  const excluded = ".arc/user/alice/nested/USER-INBOX.md";
  const overlap = ".arc/active/current/notes-overlap.md";
  const { root, io } = await fixture([projected, projected, excluded, overlap]);
  await rm(join(root, "missing.md"));
  for (const path of [projected, overlap, excluded, "new.md", "ignored.md", ".venv-notes.md"]) await write(root, path);
  await execa("git", ["add", "-f", "--", `:(literal)${overlap}`], { cwd: root });
  const result = await resolveMarkdownFixCorpus(root, io);
  expect(result.paths).toEqual([projected, overlap, "new.md", "tracked.md"]);
  expect([...result.projectedPaths].sort()).toEqual([projected, excluded, overlap].sort());
});

const fixable = "# Heading\n\nTrailing whitespace. \n";

it("fixes the authorized union alone and reports listed symlinks it cannot mutate", async () => {
  const selected = ".arc/active/current/[literal] # notes.md";
  const link = ".arc/active/current/link.md";
  const { root, io } = await fixture([selected, selected, link]);
  await write(root, selected, fixable);
  await write(root, "tracked.md", fixable);
  await write(root, "new.md", fixable);
  await write(root, "ignored.md", fixable);
  await write(root, ".arc/completed/old.md", fixable);
  await symlink("../../../ignored.md", join(root, link), "file");
  const messages: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
  expect(await main(root, [], { readProjectedSelection: io.readProjectedSelection })).toBe(0);
  for (const path of [selected, "tracked.md", "new.md"]) {
    expect(await readFile(join(root, path), "utf8")).toBe(fixable.replace(". \n", ".\n"));
  }
  for (const path of ["ignored.md", ".arc/completed/old.md"]) {
    expect(await readFile(join(root, path), "utf8")).toBe(fixable);
  }
  expect(messages.join("")).toContain(`Skipped ${link}`);
  expect(messages.join("")).toContain("symbolic link");
});

it("validates every explicit membership before fixing a valid literal subset", async () => {
  const selected = ".arc/active/current/[a].md";
  const { root, io } = await fixture([selected]);
  await write(root, selected, fixable);
  await write(root, "tracked.md", fixable);
  await write(root, "ignored.md", fixable);
  const messages: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
  expect(await main(root, ["--files", selected, "ignored.md"], { readProjectedSelection: io.readProjectedSelection })).toBe(1);
  expect(messages.join("")).toContain("ignored.md");
  expect(messages.join("")).toContain("lint corpus");
  expect(await readFile(join(root, selected), "utf8")).toBe(fixable);
  expect(await main(root, ["--files", selected], { readProjectedSelection: io.readProjectedSelection })).toBe(0);
  expect(await readFile(join(root, selected), "utf8")).not.toBe(fixable);
  expect(await readFile(join(root, "tracked.md"), "utf8")).toBe(fixable);
});

it.each([{ args: [] }, { args: ["--files", "tracked.md"] }])("leaves all files untouched until provider recovery for $args", async ({ args }) => {
  const { root, io } = await fixture();
  await write(root, "tracked.md", fixable);
  const messages: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
  const unavailable = async () => ({ status: "unavailable" as const, reason: "projection offline" });
  expect(await main(root, args, { readProjectedSelection: unavailable })).toBe(1);
  expect(messages.join("")).toContain("projection offline");
  expect(await readFile(join(root, "tracked.md"), "utf8")).toBe(fixable);
  expect(await main(root, args, { readProjectedSelection: io.readProjectedSelection })).toBe(0);
  expect(await readFile(join(root, "tracked.md"), "utf8")).not.toBe(fixable);
});

it("validates nested configuration before any tool can mutate a listed file", async () => {
  const { root, io } = await fixture();
  await write(root, "tracked.md", fixable);
  await write(root, "nested/page.md", fixable);
  await write(root, "nested/.markdownlint-cli2.jsonc", JSON.stringify({ ignores: ["**/*.md"] }));
  const messages: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(chunk => { messages.push(String(chunk)); return true; });
  expect(await main(root, [], { readProjectedSelection: io.readProjectedSelection })).toBe(1);
  expect(messages.join("")).toContain("Nested configuration must not define ignores");
  expect(await readFile(join(root, "tracked.md"), "utf8")).toBe(fixable);
  await write(root, "nested/.markdownlint-cli2.jsonc", JSON.stringify({ config: { MD012: true } }));
  expect(await main(root, [], { readProjectedSelection: io.readProjectedSelection })).toBe(0);
  expect(await readFile(join(root, "tracked.md"), "utf8")).not.toBe(fixable);
});

it.each([false, true])("accepts an empty Git contribution (projected-only=%s)", async projectedOnly => {
  const path = ".arc/active/current/notes.md";
  const { root, io } = await fixture(projectedOnly ? [path] : []);
  await execa("git", ["rm", "tracked.md", "missing.md"], { cwd: root });
  if (projectedOnly) await write(root, path);
  expect((await resolveMarkdownFixCorpus(root, io)).paths).toEqual(projectedOnly ? [path] : []);
});

function recordingCommand(root: string): string[] {
  const wrapper = `const fs = require("node:fs");
    const [receipt, tool, ...args] = process.argv.slice(1);
    const child = require("node:child_process").spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" });
    fs.appendFileSync(receipt, JSON.stringify({ args, status: child.status }) + "\\n");
    process.exit(child.status ?? 1);`;
  return [process.execPath, "-e", wrapper, join(root, "receipts.jsonl"),
    join(root, "node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs"), "--fix", "--no-globs", "--"];
}

it.each([{ explicit: false, platform: "win32" as const }, { explicit: true, platform: "linux" as const }])(
  "fixes bounded literal batches exactly once and retains an earlier failure (explicit=$explicit, $platform)", async ({ explicit, platform }) => {
    const paths = Array.from({ length: 180 }, (_, index) => `.arc/active/current/${String(index).padStart(3, "0")}-[literal] # ${"x".repeat(85)}.md`);
    const { root, io } = await fixture(paths);
    for (const path of paths) await write(root, path, fixable);
    const first = paths[0];
    if (first === undefined) throw new Error("missing first fixture");
    await write(root, first, `${fixable}\n${"word ".repeat(30)}\n`);
    await write(root, ".arc/completed/untouched.md", fixable);
    const command = recordingCommand(root);
    const options = { root, command, platform, paths: explicit ? paths : undefined,
      io: { ...io, execute: async (argv: readonly string[], cwd: string) => {
        const [program, ...args] = argv;
        if (program === undefined) throw new Error("missing program");
        return (await execa(program, args, { cwd, reject: false, env: { FORCE_COLOR: undefined } })).exitCode ?? 1;
      } } };
    const result = await runMarkdownFix(options);
    const receipts = (await readFile(join(root, "receipts.jsonl"), "utf8")).trim().split("\n")
      .map(line => JSON.parse(line) as { args: string[]; status: number });
    expect(receipts.length).toBeGreaterThan(1);
    const received = receipts.flatMap(receipt => receipt.args.slice(3));
    expect(received.sort()).toEqual(result.paths.map(path => `:${path}`).sort());
    expect(new Set(received).size).toBe(received.length);
    for (const receipt of receipts) expect(batchCheckPaths(command, receipt.args.slice(3), platform)).toHaveLength(1);
    expect(receipts.some(receipt => receipt.status !== 0)).toBe(true);
    expect(receipts.at(-1)?.status).toBe(0);
    expect(result.exitCode).not.toBe(0);
    for (const path of paths) expect(await readFile(join(root, path), "utf8")).not.toContain(". \n");
    expect(await readFile(join(root, ".arc/completed/untouched.md"), "utf8")).toBe(fixable);
  }, 60_000);

it.each(["membership", "configuration", "budget"])("preflights the entire large corpus before writing on %s refusal", async refusal => {
  const paths = Array.from({ length: 100 }, (_, index) => `.arc/active/current/${index}-${"x".repeat(90)}.md`);
  const { root, io } = await fixture(paths);
  for (const path of paths) await write(root, path, fixable);
  const command = recordingCommand(root);
  let expected = "lint corpus";
  if (refusal === "configuration") {
    await write(root, ".arc/active/current/.markdownlint-cli2.jsonc", JSON.stringify({ ignores: ["**/*.md"] }));
    expected = "Nested configuration";
  }
  if (refusal === "budget") { command.push("x".repeat(9000)); expected = "argument budget"; }
  const requested = refusal === "membership" ? [...paths, ".arc/completed/refused.md"] : paths;
  await expect(runMarkdownFix({ root, command, paths: requested, platform: "win32", io: { ...io,
    execute: async (argv, cwd) => {
      const [program, ...args] = argv;
      if (program === undefined) throw new Error("missing program");
      return (await execa(program, args, { cwd, reject: false })).exitCode ?? 1;
    } } })).rejects.toThrow(expected);
  await expect(readFile(join(root, "receipts.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  for (const path of paths) expect(await readFile(join(root, path), "utf8")).toBe(fixable);
}, 60_000);

it.each([{ projectedOnly: false }, { projectedOnly: true }])("runs empty Git contributions safely (projected-only=$projectedOnly)", async ({ projectedOnly }) => {
  const path = ".arc/active/current/only.md";
  const { root, io } = await fixture(projectedOnly ? [path] : []);
  await execa("git", ["rm", "tracked.md", "missing.md"], { cwd: root });
  if (projectedOnly) await write(root, path, fixable);
  const result = await runMarkdownFix({ root, command: recordingCommand(root), io: { ...io,
    execute: async (argv, cwd) => {
      const [program, ...args] = argv;
      if (program === undefined) throw new Error("missing program");
      return (await execa(program, args, { cwd, reject: false })).exitCode ?? 1;
    } } });
  expect(result.exitCode).toBe(0);
  if (projectedOnly) {
    expect(await readFile(join(root, path), "utf8")).not.toBe(fixable);
    expect(await readFile(join(root, "receipts.jsonl"), "utf8")).toContain(`:${path}`);
  } else await expect(readFile(join(root, "receipts.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports Git administration, symlink parents, and nonregular listed files without granting write authority", async () => {
  const admin = "git-admin/notes.md";
  const directory = ".arc/active/current/directory.md";
  const parent = ".arc/active/current/alias/tracked.md";
  const { root, io } = await fixture([admin, directory, parent]);
  await execa("git", ["init", "-q", "--separate-git-dir", join(root, "git-admin")], { cwd: root });
  await write(root, admin, fixable);
  await mkdir(join(root, directory), { recursive: true });
  await write(root, "ordinary/tracked.md");
  await symlink(join(root, "ordinary"), join(root, ".arc/active/current/alias"), "junction");
  const plan = await prepareMarkdownFix(root, io);
  expect(plan.paths).toEqual(["missing.md", "ordinary/tracked.md", "tracked.md"]);
  expect(plan.skipped.find(entry => entry.path === admin)?.reason).toContain("Git administration");
  expect(plan.skipped.find(entry => entry.path === directory)?.reason).toContain("not a regular file");
  expect(plan.skipped.find(entry => entry.path === parent)?.reason).toContain("symbolic link");
  expect(await readFile(join(root, admin), "utf8")).toBe(fixable);
});
