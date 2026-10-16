/** Detached lifecycle spawns repair one stale registration while preserving locks and other registrations. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { reconcileWorkUnitWorktree, nodeReconcileWorkUnitWorktreeFs } from "../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { createLinkedWorktree } from "../../src/lib/git/linked-worktree.js";
import { clearMissingWorktreeRegistrations, PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const SPAWN_TIMEOUT_MS = 30_000;
async function fixture(lock?: string) {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]); await writeFile(join(root, "base"), "base\n");
  await exec("git", ["add", "base"]); await exec("git", ["commit", "-m", "base"]);
  const path = join(root, "checkout"); const other = join(root, "other");
  await exec("git", ["worktree", "add", "--detach", path, "main"]);
  await exec("git", ["worktree", "add", "--detach", other, "main"]);
  if (lock !== undefined) await exec("git", ["worktree", "lock", "--reason", lock, path]);
  await rm(path, { recursive: true }); await rm(other, { recursive: true });
  const exists = (target: string) => stat(target).then(() => true, (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false; throw error;
  });
  return { root, exec, path, other, exists };
}
describe("stale lifecycle spawn registrations", () => {
  it("unlocks the projection's stale registration and creates a detached checkout without touching another stale one", async () => {
    const h = await fixture(PROJECTION_LOCK_REASON);
    const result = await createLinkedWorktree({ exec: h.exec, pathExists: h.exists,
      clearMissingRegistration: async (request) => {
        const cleared = await clearMissingWorktreeRegistrations({ ...request, exec: h.exec, primaryWorktreePath: h.root, folderExists: h.exists });
        if (cleared.kind === "refused") throw Error(cleared.reason);
      } }, { detached: true, locationTemplate: h.path, repo: "repo", placementName: "demo", base: "main" });
    expect(result.kind).toBe("created");
    expect((await h.exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: h.path }).catch(() => null))).toBeNull();
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(`worktree ${h.other}\n`);
    expect((await stat(h.path)).isDirectory()).toBe(true);
  }, SPAWN_TIMEOUT_MS);
  it("refuses another owner's stale lock with its unlock remedy before creating any folder", async () => {
    const h = await fixture("operator");
    const result = await createLinkedWorktree({ exec: h.exec, pathExists: h.exists,
      clearMissingRegistration: async (request) => {
        const cleared = await clearMissingWorktreeRegistrations({ ...request, exec: h.exec, primaryWorktreePath: h.root, folderExists: h.exists });
        if (cleared.kind === "refused") throw Error(cleared.reason);
      } }, { detached: true, locationTemplate: h.path, repo: "repo", placementName: "demo", base: "main" });
    expect(result).toMatchObject({ kind: "error", reason: "stale-registration-refused", error: expect.objectContaining({ message: expect.stringContaining(`git worktree unlock ${h.path}`) }) });
    expect(await h.exists(h.path)).toBe(false);
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain("locked operator");
    await mkdir(h.path); // prove a folder restored before a later repair is preserved
    expect(await clearMissingWorktreeRegistrations({ exec: h.exec, primaryWorktreePath: h.root, targetPath: h.path, folderExists: h.exists })).toEqual({ kind: "clear", prunedPaths: [] });
    expect(await h.exists(h.path)).toBe(true);
  }, SPAWN_TIMEOUT_MS);
});

describe("stale branch registrations", () => {
  it("clears a folderless registration holding the branch before reattachment in a new checkout", async () => {
    const h = await fixture(); await h.exec("git", ["worktree", "remove", h.path]);
    await h.exec("git", ["worktree", "add", "-b", "feat/demo", h.path, "main"]);
    await h.exec("git", ["worktree", "lock", "--reason", PROJECTION_LOCK_REASON, h.path]); await rm(h.path, { recursive: true });
    const next = join(h.root, "next");
    const result = await createLinkedWorktree({ exec: h.exec, pathExists: h.exists,
      clearMissingRegistration: async (request) => {
        const cleared = await clearMissingWorktreeRegistrations({ ...request, exec: h.exec, primaryWorktreePath: h.root, folderExists: h.exists });
        if (cleared.kind === "refused") throw Error(cleared.reason);
      } }, { branch: "feat/demo", createBranch: false, locationTemplate: next, repo: "repo", placementName: "demo", base: "main" });
    expect(result.kind).toBe("created");
    expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd: next })).stdout).toBe("feat/demo");
    expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(`worktree ${h.path}\n`);
  }, SPAWN_TIMEOUT_MS);
  it.each([PROJECTION_LOCK_REASON, "operator"])("in-place branch reattachment handles a missing registration locked by %s", async (lock) => {
    const h = await fixture(); await h.exec("git", ["worktree", "remove", h.path]);
    await h.exec("git", ["worktree", "add", "-b", "feat/demo", h.path, "main"]);
    await h.exec("git", ["worktree", "lock", "--reason", lock, h.path]); await rm(h.path, { recursive: true });
    const store = createLifecycleHarness().store;
    const attempt = reconcileWorkUnitWorktree({ exec: h.exec, store, fs: nodeReconcileWorkUnitWorktreeFs, chdir: () => { throw Error("no process hop"); } },
      { mutation: "spawn", inPlace: true, branch: "feat/demo", wuName: "demo", spawningIdentity: "starter" });
    if (lock === "operator") {
      await expect(attempt).rejects.toThrow(`git worktree unlock ${h.path}`);
      expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("main");
    } else {
      expect(await attempt).toMatchObject({ mutation: "spawn", branch: "feat/demo", worktreePath: h.root });
      expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout).toBe("feat/demo");
    }
  }, SPAWN_TIMEOUT_MS);
  it("retains the existing add refusal when its caller supplies no repair step", async () => {
    const h = await fixture();
    expect(await createLinkedWorktree({ exec: h.exec, pathExists: h.exists },
      { detached: true, locationTemplate: h.path, repo: "repo", placementName: "demo", base: "main" })).toMatchObject({ kind: "error", reason: "git-worktree-add-failed" });
    expect(await h.exists(h.path)).toBe(false);
  }, SPAWN_TIMEOUT_MS);
});
