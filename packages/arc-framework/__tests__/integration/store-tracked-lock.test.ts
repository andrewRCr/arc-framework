/** Real primary and linked checkouts serialize only their own tracked writes. */

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { resolveCheckoutGitDir } from "../../src/lib/git/exec.js";
import { TRACKED_WRITE_LOCK_FILENAME, withTrackedWriteLock } from "../../src/lib/store/tracked-lock.js";
import { acquireAdvisoryLock, AdvisoryLockTimeoutError, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { withWorktreeOperationLock } from "../../src/lib/work-unit/worktree-operation-lock.js";

let repository: string | undefined;
afterEach(async () => { if (repository !== undefined) await cleanupTempDir(repository); repository = undefined; });
async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }

async function checkoutPair() {
  repository = await createTempRepo("arc-tracked-checkouts-");
  const primary = repository;
  const exec = makeGitExec(primary);
  await exec("git", ["commit", "--allow-empty", "-m", "initial"]);
  const linked = join(primary, "linked-checkout");
  await exec("git", ["worktree", "add", "-b", "linked", linked]);
  return { primary, linked, exec };
}

describe("tracked-write checkout isolation", () => {
  it("writes in a linked checkout while the primary tracked and common worktree locks are held", async () => {
    const { primary, linked, exec } = await checkoutPair();
    const primaryGitDir = await resolveCheckoutGitDir(exec, primary);
    const linkedGitDir = await resolveCheckoutGitDir(exec, linked);
    expect(primaryGitDir).not.toBe(linkedGitDir);
    const primaryLock = join(primaryGitDir, TRACKED_WRITE_LOCK_FILENAME);
    const linkedLock = join(linkedGitDir, TRACKED_WRITE_LOCK_FILENAME);
    let clock = 0;
    const options = { maxWaitMs: 30, now: () => clock, sleep: async (ms: number) => { clock += ms; } };
    await expect(withWorktreeOperationLock({ exec, cwd: primary, lockOptions: options, operation: async (commonLock) => {
      return withTrackedWriteLock({ exec, checkoutRoot: primary, options }, async () => {
        await writeFile(join(primary, "tracked.md"), "primary write");
        expect(await exists(commonLock)).toBe(true);
        expect(await exists(primaryLock)).toBe(true);
        await withTrackedWriteLock({ exec, checkoutRoot: linked, options }, async (heldPath) => {
          expect(heldPath).toBe(linkedLock);
          expect(await exists(primaryLock)).toBe(true);
          expect(await exists(linkedLock)).toBe(true);
          await writeFile(join(linked, "tracked.md"), "linked write");
        });
        expect(await exists(primaryLock)).toBe(true);
        return "both written";
      });
    } })).resolves.toBe("both written");
    expect(await readFile(join(primary, "tracked.md"), "utf8")).toBe("primary write");
    expect(await readFile(join(linked, "tracked.md"), "utf8")).toBe("linked write");
    expect(await exists(primaryLock)).toBe(false);
    expect(await exists(linkedLock)).toBe(false);
  });

  it("times out in a real linked checkout without writing, then retries successfully after release", async () => {
    const { linked, exec } = await checkoutPair();
    const lockPath = join(await resolveCheckoutGitDir(exec, linked), TRACKED_WRITE_LOCK_FILENAME);
    const recordPath = join(linked, "tracked.md");
    await writeFile(recordPath, "before");
    const holder = await acquireAdvisoryLock(lockPath);
    let clock = 0;
    const context = { exec, checkoutRoot: linked, options: { maxWaitMs: 30,
      now: () => clock, sleep: async (ms: number) => { clock += ms; } } };
    const write = () => withTrackedWriteLock(context, async () => { await writeFile(recordPath, "after"); return "written"; });
    try {
      await expect(write()).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);
      expect(await readFile(recordPath, "utf8")).toBe("before");
      expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({ token: holder.token });
    } finally { await releaseAdvisoryLock(holder); }
    await expect(write()).resolves.toBe("written");
    expect(await readFile(recordPath, "utf8")).toBe("after");
    expect(await exists(lockPath)).toBe(false);
  });
});
