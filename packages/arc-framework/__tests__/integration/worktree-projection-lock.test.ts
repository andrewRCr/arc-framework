/** A checkout under the projection's lock refuses Git's plain removal naming ARC's exits, and moves with its lock. */
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { lockSpawnedCheckout, PROJECTION_LOCK_REASON, removeWorktreeCheckout } from "../../src/lib/git/worktree-removal.js";

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
