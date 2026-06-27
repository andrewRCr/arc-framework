/**
 * Unit tests for the portable per-identity advisory lock primitive.
 *
 * Covers exclusive-create acquisition, bounded-backoff contention, stale-lock
 * reclamation (dead pid + mtime ceiling), concurrent stale-break convergence,
 * and ownership-verified release. Time and process-liveness are injected so the
 * assertions stay deterministic; the exclusive-create / read / remove path runs
 * against a real temp-dir filesystem (the faithful boundary).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  acquireAdvisoryLock,
  releaseAdvisoryLock,
  getNotesLockPath,
  AdvisoryLockTimeoutError,
  type AdvisoryLockOptions,
} from "../../src/lib/user-sync/notes-lock.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readHolder(path: string): Promise<{ pid: number; acquiredAt: number }> {
  return JSON.parse(await readFile(path, "utf-8")) as { pid: number; acquiredAt: number };
}

describe("acquireAdvisoryLock", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "arc-advisory-lock-test-"));
    lockPath = join(dir, ".notes.lock");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("acquiring an uncontended lock creates the lockfile recording the holder pid and mtime", async () => {
    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 4242,
      now: () => 1000,
      isProcessAlive: () => true,
    });

    expect(handle.path).toBe(lockPath);
    expect(handle.pid).toBe(4242);
    const holder = await readHolder(lockPath);
    expect(holder.pid).toBe(4242);
    expect(holder.acquiredAt).toBe(1000);
  });

  it("retries with bounded backoff while the lock is held-and-live, then proceeds once it frees", async () => {
    await writeFile(lockPath, JSON.stringify({ pid: 1, acquiredAt: 0 }), "utf-8");

    let sleeps = 0;
    const sleep = vi.fn(async () => {
      sleeps += 1;
      // The live holder releases mid-contention: free the lock on the 2nd backoff.
      if (sleeps === 2) await rm(lockPath, { force: true });
    });

    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 2,
      now: () => 0,
      isProcessAlive: () => true,
      sleep,
    });

    expect(sleeps).toBeGreaterThanOrEqual(2);
    expect(handle.pid).toBe(2);
    expect((await readHolder(lockPath)).pid).toBe(2);
  });

  it("times out with a bounded wait when the lock stays held-and-live", async () => {
    await writeFile(lockPath, JSON.stringify({ pid: 1, acquiredAt: 0 }), "utf-8");

    let clock = 0;
    const now = () => (clock += 1000);

    await expect(
      acquireAdvisoryLock(lockPath, {
        pid: 2,
        now,
        isProcessAlive: () => true,
        sleep: async () => {},
        maxWaitMs: 50,
      }),
    ).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);

    // The original live holder is left intact — a timeout never breaks a live lock.
    expect((await readHolder(lockPath)).pid).toBe(1);
  });

  it("reclaims a lock whose recorded pid is no longer alive (ESRCH)", async () => {
    await writeFile(lockPath, JSON.stringify({ pid: 9999, acquiredAt: 0 }), "utf-8");

    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 2,
      now: () => 5,
      isProcessAlive: (pid) => pid !== 9999,
    });

    expect(handle.pid).toBe(2);
    expect((await readHolder(lockPath)).pid).toBe(2);
  });

  it("reclaims a lock past the generous mtime ceiling even when its pid is still alive", async () => {
    await writeFile(lockPath, JSON.stringify({ pid: 1, acquiredAt: 0 }), "utf-8");

    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 2,
      now: () => 2000,
      isProcessAlive: () => true,
      staleCeilingMs: 1000,
    });

    expect(handle.pid).toBe(2);
    expect((await readHolder(lockPath)).pid).toBe(2);
  });

  it("converges two concurrent stale-breakers on a single holder", async () => {
    // A dead holder both contenders will try to break at once.
    await writeFile(lockPath, JSON.stringify({ pid: 9999, acquiredAt: 0 }), "utf-8");
    const isProcessAlive = (pid: number) => pid !== 9999;

    const shared: AdvisoryLockOptions = {
      isProcessAlive,
      maxWaitMs: 150,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };

    const results = await Promise.allSettled([
      acquireAdvisoryLock(lockPath, { ...shared, pid: 101 }),
      acquireAdvisoryLock(lockPath, { ...shared, pid: 102 }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Exactly one breaks through; the loser sees the live winner and times out —
    // the exclusive create, not the remove, is what makes them converge.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winnerPid = (fulfilled[0] as PromiseFulfilledResult<{ pid: number }>).value.pid;
    expect([101, 102]).toContain(winnerPid);
    expect((await readHolder(lockPath)).pid).toBe(winnerPid);
  });
});

describe("releaseAdvisoryLock", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "arc-advisory-lock-test-"));
    lockPath = join(dir, ".notes.lock");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("frees a lock it owns", async () => {
    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 5,
      now: () => 1,
      isProcessAlive: () => true,
    });

    await releaseAdvisoryLock(handle);

    expect(await exists(lockPath)).toBe(false);
  });

  it("never drops another holder's lock — verifies ownership before removing", async () => {
    // Our handle, but the on-disk lock now belongs to a different live holder
    // (ours was reclaimed as stale and re-acquired while we were away).
    const handle = { path: lockPath, pid: 5 };
    await writeFile(lockPath, JSON.stringify({ pid: 6, acquiredAt: 0 }), "utf-8");

    await releaseAdvisoryLock(handle);

    expect(await exists(lockPath)).toBe(true);
    expect((await readHolder(lockPath)).pid).toBe(6);
  });

  it("tolerates an already-absent lock", async () => {
    await expect(releaseAdvisoryLock({ path: lockPath, pid: 5 })).resolves.toBeUndefined();
  });
});

describe("getNotesLockPath", () => {
  it("resolves the notes lockfile under the identity's .internal bookkeeping dir", () => {
    const path = getNotesLockPath("/repo", "andrew");
    expect(path).toBe(join("/repo", ".arc", "user", "andrew", ".internal", ".notes.lock"));
  });
});
