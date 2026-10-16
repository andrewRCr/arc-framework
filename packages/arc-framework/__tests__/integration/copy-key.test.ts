/** Copy-key identity over real Git objects under every pinned diff source. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeCopyKeys } from "../../src/lib/git/copy-key.js";
import { createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { cleanupTempDir, createTempRepo, execFileAsync } from "../helpers/integration.js";

let cwd: string;
const directories: string[] = [];
const date = "1700000000 +0000";
const beforeDiff = "}\n  y\nb\na\na\n  x\n  x\nb\n\na\n  x\n\n  z\nb\n\n  z\n  x\n  z\n  z\n  y\n  x\n  x\n{\n}\n{\n  y\n  x\nb\n  z\n  z\n{\n  y\n{\n  x\n  z\n";
const afterDiff = "}\n  y\nb\n}\na\n  x\n  x\nb\n\na\n  x\n\n  z\nb\n\n\n  z\n  y\n  x\n  y\n  y\n  x\n  x\n{\n  y\n  x\nb\n  z\n  z\n{\n  y\n{\n  x\n  z\n";
async function git(args: string[]): Promise<string> {
  return (await execFileAsync("git", args, {
    cwd, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, FORCE_COLOR: "0" },
  })).stdout.trim();
}
async function commit(files: Record<string, string | Buffer>, parent?: string): Promise<string> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(cwd, path, ".."), { recursive: true });
    await writeFile(join(cwd, path), content);
  }
  await git(["add", "--all"]);
  const tree = await git(["write-tree"]);
  return git(["commit-tree", tree, ...(parent === undefined ? [] : ["-p", parent]), "-m", "fixture"]);
}
async function key(sha: string): Promise<string | undefined> {
  return (await computeCopyKeys({ cwd, commits: [sha] })).get(sha)?.copyKey;
}
beforeEach(async () => { cwd = await createTempRepo("arc-copy-key-"); directories.push(cwd); });
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map(cleanupTempDir)); });

describe("copy-key pinned producer", () => {
  it.each([
    ["core.quotePath", "false"],
    ["diff.suppressBlankEmpty", "true"],
    ["diff.indentHeuristic", "false"],
    ["core.bigFileThreshold", "1"],
    ["diff.custom.algorithm", "histogram"],
  ])("is stable under %s=%s", async (setting, value) => {
    const parent = await commit({ "é.txt": beforeDiff, ".gitattributes": "*.txt diff=custom\n" });
    const sha = await commit({ "é.txt": afterDiff }, parent);
    const expected = await key(sha);
    expect(expected).toBeDefined();
    expect(expected).toMatch(/^v1:[a-f0-9]{64}:[a-f0-9]{64}$/u);
    await git(["config", setting, value]);
    expect(await key(sha)).toBe(expected);
  });

  it.each(["global", "info", "checkout"])("ignores -diff attributes from %s", async (source) => {
    const parent = await commit({ "file.txt": "before\n" });
    const sha = await commit({ "file.txt": "after\n" }, parent);
    const expected = await key(sha);
    expect(expected).toBeDefined();
    if (source === "global") {
      const path = join(cwd, "attributes");
      await writeFile(path, "*.txt -diff\n");
      await git(["config", "core.attributesFile", path]);
    } else await writeFile(join(cwd, source === "info" ? ".git/info/attributes" : ".gitattributes"), "*.txt -diff\n");
    expect(await key(sha)).toBe(expected);
  });

  it("removes GIT_DIFF_OPTS and ignores replace refs on both key halves", async () => {
    const parent = await commit({ "file.txt": "first\nbefore\nlast\n" });
    const sha = await commit({ "file.txt": "first\nafter\nlast\n" }, parent);
    const expected = await key(sha);
    expect(expected).toBeDefined();
    vi.stubEnv("GIT_DIFF_OPTS", "--unified=0");
    expect(await key(sha)).toBe(expected);
    const replacement = await commit({ "file.txt": "replacement\n" }, parent);
    await git(["replace", sha, replacement]);
    expect(await key(sha)).toBe(expected);
  });

  it("ignores submodule ignore configuration", async () => {
    const first = await commit({ "file.txt": "first\n", ".gitmodules": '[submodule "module"]\n path = module\n url = ./module\n' });
    const second = await commit({ "file.txt": "second\n" }, first);
    await git(["update-index", "--add", "--cacheinfo", `160000,${first},module`]);
    const beforeTree = await git(["write-tree"]);
    const before = await git(["commit-tree", beforeTree, "-p", second, "-m", "before gitlink"]);
    await git(["update-index", "--cacheinfo", `160000,${second},module`]);
    const afterTree = await git(["write-tree"]);
    const after = await git(["commit-tree", afterTree, "-p", before, "-m", "after gitlink"]);
    const expected = await key(after);
    expect(expected).toBeDefined();
    await git(["config", "submodule.module.ignore", "all"]);
    expect(await key(after)).toBe(expected);
  });

  it.each([
    ["whitespace", "left right\n", "left  right\n"],
    ["UTF-16", Buffer.from("first", "utf16le"), Buffer.from("fifth", "utf16le")],
    ["bytes after NUL", Buffer.from("same\0first\n"), Buffer.from("same\0second\n")],
    ["NUL versus escape bytes", Buffer.from([0, 10]), Buffer.from([1, 2, 10])],
  ])("keeps distinct %s patches apart with the same author line", async (_name, first, second) => {
    const parent = await commit({ "file.txt": "base\n" });
    const a = await commit({ "file.txt": first }, parent);
    const b = await commit({ "file.txt": second }, parent);
    const aKey = await key(a);
    const bKey = await key(b);
    expect(aKey).toBeDefined(); expect(bKey).toBeDefined();
    expect(aKey?.split(":")[1]).toBe(bKey?.split(":")[1]);
    expect(aKey).not.toBe(bKey);
  });

  it("does not truncate a patch at a no-final-newline marker", async () => {
    const parent = await commit({ "a.txt": "before", "z.txt": "base\n" });
    const a = await commit({ "a.txt": "after", "z.txt": "first\n" }, parent);
    const b = await commit({ "a.txt": "after", "z.txt": "second\n" }, parent);
    expect(await key(a)).not.toBe(await key(b));
  });

  it("keeps Git's own verbatim patch ID for ordinary patch bytes and raw header times", async () => {
    const parent = await commit({ "file.txt": "before\n" });
    const sha = await commit({ "file.txt": "after\n" }, parent);
    const raw = createExecaRawGitExec(cwd);
    const diff = await raw(["diff-tree", "--stdin", "-p", "--full-index", "--root"], { input: Buffer.from(`${sha}\n`) });
    const id = await raw(["patch-id", "--verbatim"], { input: diff.stdout });
    const patchId = Buffer.from(id.stdout).toString().split(" ")[0]!;
    const evidence = (await computeCopyKeys({ cwd, commits: [sha] })).get(sha);
    expect(evidence).toMatchObject({ authorTime: 1700000000, committerTime: 1700000000 });
    expect(evidence?.copyKey?.split(":")[2]).toBe(createHash("sha256").update(patchId).digest("hex"));
  });

  it("associates each batch key with its commit across an empty commit", async () => {
    const parent = await commit({ "file.txt": "base\n" });
    const first = await commit({ "file.txt": "first\n" }, parent);
    const empty = await git(["commit-tree", await git(["write-tree"]), "-p", first, "-m", "empty"]);
    const last = await commit({ "file.txt": "last\n" }, first);
    const results = await computeCopyKeys({ cwd, commits: [first, empty, last] });
    expect(results.get(first)?.copyKey).toBe(await key(first));
    expect(results.get(empty)?.copyKey).toBeUndefined();
    expect(results.get(last)?.copyKey).toBe(await key(last));
    expect(results.get(first)?.copyKey).not.toBe(results.get(last)?.copyKey);
  });

  it("hashes untouched raw author bytes and retains different header times", async () => {
    await commit({ "file.txt": "raw header\n" });
    const tree = await git(["write-tree"]);
    const author = Buffer.from("André <a@example.com> 1700000000 +0130", "latin1");
    const raw = createExecaRawGitExec(cwd);
    const object = await raw(["hash-object", "-w", "-t", "commit", "--stdin"], {
      input: Buffer.concat([
        Buffer.from(`tree ${tree}\nauthor `), author,
        Buffer.from("\ncommitter Other <b@example.com> 1700000001 +0200\n\nmessage\n"),
      ]),
    });
    const sha = Buffer.from(object.stdout).toString().trim();
    const result = (await computeCopyKeys({ cwd, commits: [sha] })).get(sha);
    expect(result?.copyKey?.split(":")[1]).toBe(createHash("sha256").update(author).digest("hex"));
    expect(result).toMatchObject({ authorTime: 1700000000, committerTime: 1700000001 });
  });

  it("returns no key for empty, merge, and missing commits", async () => {
    const parent = await commit({ "file.txt": "base\n" });
    const empty = await git(["commit-tree", await git(["write-tree"]), "-p", parent, "-m", "empty"]);
    const other = await commit({ "file.txt": "other\n" }, parent);
    const merge = await git(["commit-tree", await git(["write-tree"]), "-p", parent, "-p", other, "-m", "merge"]);
    const absent = "a".repeat(40);
    const results = await computeCopyKeys({ cwd, commits: [empty, merge, absent] });
    expect(results.get(empty)).toEqual({ authorTime: 1700000000, committerTime: 1700000000 });
    expect(results.get(merge)?.copyKey).toBeUndefined();
    expect(results.get(absent)).toEqual({ authorTime: null, committerTime: null });
  });

  it("retries an overflowing batch individually and omits an oversized single patch", async () => {
    const parent = await commit({ "file.txt": "base\n" });
    const small = await commit({ "file.txt": "small\n" }, parent);
    const large = await commit({ "file.txt": "many long lines\n".repeat(500) }, parent);
    const result = await computeCopyKeys({ cwd, commits: [small, large], execRaw: createExecaRawGitExec(cwd, 1024) });
    expect(result.get(small)?.copyKey).toBe(await key(small));
    expect(result.get(large)).toEqual({ authorTime: 1700000000, committerTime: 1700000000 });
  });

  it("does not fetch a partial clone's absent blobs", async () => {
    const parent = await commit({ "file.txt": "before\n" });
    const sha = await commit({ "file.txt": "after\n" }, parent);
    await git(["update-ref", "refs/heads/main", sha]);
    await git(["config", "uploadpack.allowFilter", "true"]);
    const clone = join(cwd, "partial-clone");
    await execFileAsync("git", ["clone", "--no-checkout", "--filter=blob:none", `file://${cwd}`, clone], { cwd });
    const raw = createExecaRawGitExec(clone);
    const before = await raw(["rev-list", "--objects", "--missing=print", sha], { objectAccess: "local-only" });
    expect(Buffer.from(before.stdout).toString()).toContain("?");
    const result = await computeCopyKeys({ cwd: clone, commits: [sha] });
    expect(result.get(sha)?.copyKey).toBeUndefined();
    const after = await raw(["rev-list", "--objects", "--missing=print", sha], { objectAccess: "local-only" });
    expect(after.stdout).toEqual(before.stdout);
  }, 30000);
});
