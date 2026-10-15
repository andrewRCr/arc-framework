/** Registered folder observations are independent of Git's pruning annotation. */
import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { scanRegisteredWorktrees } from "../../../src/lib/git/worktree-roster.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
function execFor(paths: string[]): GitExec {
  const stdout = paths.map((path, index) => [
    `worktree ${path}`, `HEAD ${"a".repeat(40)}`, "detached",
    ...(index === 0 ? ["prunable gitdir no longer points here"] : ["locked keep registration"]), "", "",
  ].join("\0")).join("");
  return async () => ({ stdout, stderr: "" });
}

describe("registered worktree folders", () => {
  it("reads present and hand-deleted folders independently of prune and lock annotations", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-roster-folder-"));
    roots.push(root);
    const present = join(root, "present");
    const missing = join(root, "missing");
    await mkdir(present);
    await mkdir(missing);
    await rm(missing, { recursive: true });
    const result = await scanRegisteredWorktrees(execFor([present, missing]));
    expect(result).toMatchObject({ ok: true, worktrees: [
      { path: present, folderPresent: true }, { path: missing, folderPresent: false },
    ] });
  });
  it("observes each registered folder exactly once", async () => {
    const reads = new Map<string, number>();
    const root = await mkdtemp(join(tmpdir(), "arc-roster-read-once-"));
    roots.push(root);
    const missing = join(root, "missing");
    const result = await scanRegisteredWorktrees(execFor([root, missing]), async (path) => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return lstat(path);
    });
    expect(result).toMatchObject({ ok: true, worktrees: [
      { path: root, folderPresent: true }, { path: missing, folderPresent: false },
    ] });
    expect(Object.fromEntries(reads)).toEqual({ [root]: 1, [missing]: 1 });
  });
  it.each(["EACCES", "EPERM", "EIO"])("treats an unobservable folder (%s) as present", async (code) => {
    const result = await scanRegisteredWorktrees(execFor(["/repo"]), async () => {
      throw Object.assign(new Error("cannot inspect folder"), { code });
    });
    expect(result).toMatchObject({ ok: true, worktrees: [{ folderPresent: true }] });
  });
  it("treats a missing path component as an absent folder", async () => {
    const result = await scanRegisteredWorktrees(execFor(["/repo/file/child"]), async () => {
      throw Object.assign(new Error("not a directory"), { code: "ENOTDIR" });
    });
    expect(result).toMatchObject({ ok: true, worktrees: [{ folderPresent: false }] });
  });
});
