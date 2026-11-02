/** A checkout under the projection's lock refuses Git's plain removal naming ARC's exits, and moves with its lock. */
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { quoteShellArgument } from "../../src/lib/release/commit-message-retry.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  lockSpawnedCheckout, passingProjectionRemovalSlots, PROJECTION_LOCK_REASON, removeWorktreeCheckout,
} from "../../src/lib/git/worktree-removal.js";

const execFileAsync = promisify(execFile);
let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });

async function lockedCheckout() {
  root = await createTempRepo();
  const exec = makeGitExec(root);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const path = join(root, "checkout");
  await exec("git", ["worktree", "add", "--detach", path]);
  expect(await lockSpawnedCheckout(exec, path)).toEqual({ kind: "locked" });
  return { root, exec, path };
}

it("refuses a plain git worktree remove naming both kinds of exit, and the removal function removes it", async () => {
  const h = await lockedCheckout();
  const refused = await execFileAsync("git", ["worktree", "remove", h.path], { cwd: h.root }).then(() => null, (error: unknown) => error);
  const stderr = (refused as { stderr?: string } | null)?.stderr ?? "";
  expect(stderr).toContain(`lock reason: ${PROJECTION_LOCK_REASON}`);
  expect(stderr).toContain("arc teardown");
  expect(stderr).toContain("arc errand close");
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);

  expect(await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root })).toEqual({ kind: "removed" });
  expect(await stat(h.path).catch(() => null)).toBeNull();
  expect((await h.exec("git", ["worktree", "list", "--porcelain"])).stdout).not.toContain(h.path);
});

it("keeps the lock and its reason through git worktree move -f -f", async () => {
  const h = await lockedCheckout();
  const moved = join(h.root, "moved");
  await h.exec("git", ["worktree", "move", "-f", "-f", h.path, moved]);
  expect(await readWorktreeLock(h.exec, moved)).toBe(PROJECTION_LOCK_REASON);
});

it("locks the checkout again when git worktree remove fails after the unlock, and a rerun removes it", async () => {
  const h = await lockedCheckout();
  let retires = 0;
  // The second re-observation runs after the unlock: work landing there makes Git's plain removal refuse.
  const beforeRetire = async () => { if (++retires === 2) await writeFile(join(h.path, "late-work.txt"), "arrived after the check\n"); };
  const failed = await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root, beforeRetire });
  expect(failed).toMatchObject({ kind: "failed", step: "remove" });
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);

  await rm(join(h.path, "late-work.txt"));
  expect(await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root })).toEqual({ kind: "removed" });
  expect(await stat(h.path).catch(() => null)).toBeNull();
});

it("keeps the lock when the re-observation after the unlock throws", async () => {
  const h = await lockedCheckout();
  let retires = 0;
  const beforeRetire = async () => { if (++retires === 2) throw new Error("Its owner changed after the persist step"); };
  const failed = await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root, beforeRetire });
  expect(failed).toMatchObject({ kind: "failed", step: "remove", detail: expect.stringContaining("owner changed") });
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);
  expect(await stat(h.path)).toBeTruthy();
});

it("keeps the lock on a missing checkout's registration when its folder returns after the unlock", async () => {
  const h = await lockedCheckout();
  await rm(h.path, { recursive: true });
  // The folder returns between the persist step's re-observation and the removal's own look.
  const beforeRetire = async () => { await mkdir(h.path, { recursive: true }); };
  const failed = await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root, onlyMissing: true, beforeRetire });
  expect(failed).toMatchObject({ kind: "failed", step: "remove", detail: expect.stringContaining("folder has returned") });
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);
});

it("names a relock that fails in the failed result, with the remedy of locking the checkout again", async () => {
  const h = await lockedCheckout();
  // Real Git throughout, but for the relock, which meets an index.lock-style failure.
  const exec: GitExec = async (command, args, options) => {
    if (args[0] === "worktree" && args[1] === "lock") {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fatal: could not write the lock file" });
    }
    return h.exec(command, args, options);
  };
  let retires = 0;
  const beforeRetire = async () => { if (++retires === 2) await writeFile(join(h.path, "late-work.txt"), "arrived after the check\n"); };
  const failed = await removeWorktreeCheckout({ exec, checkoutPath: h.path, primaryWorktreePath: h.root, beforeRetire });
  expect(failed).toMatchObject({ kind: "failed", step: "remove" });
  expect(failed.kind === "failed" ? failed.detail : "").toContain(`git worktree lock --reason ${quoteShellArgument(PROJECTION_LOCK_REASON)} ${quoteShellArgument(h.path)}`);
  expect(await readWorktreeLock(h.exec, h.path)).toBeUndefined();
});

it("leaves the lock untouched when an injected persist slot refuses before the unlock", async () => {
  const h = await lockedCheckout();
  const remedy = { text: "Save the projected edits with arc save, then retry." };
  const slots = { ...passingProjectionRemovalSlots, persist: async () => ({ kind: "refused" as const, remedy }) };
  expect(await removeWorktreeCheckout({ exec: h.exec, checkoutPath: h.path, primaryWorktreePath: h.root, slots }))
    .toEqual({ kind: "failed", step: "persist", detail: remedy.text, remedy });
  expect(await readWorktreeLock(h.exec, h.path)).toBe(PROJECTION_LOCK_REASON);
});
