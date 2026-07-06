/**
 * Unit tests for the portable per-identity advisory lock primitive.
 *
 * Covers exclusive-create acquisition, bounded-backoff contention, abandoned-lock
 * reclamation (dead pid / malformed), the live- and unreadable-holder wait paths
 * (never evicted, bounded by a timeout), concurrent stale-break convergence, the
 * deadline-bounded unremovable-lock path, the create-before-write empty read-back,
 * and token-verified release (including a same-pid sibling). Time and
 * process-liveness are injected so the assertions stay deterministic; the
 * exclusive-create / read / remove path runs against a real temp-dir filesystem
 * (the faithful boundary).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join, resolve } from "node:path";
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

async function readHolder(path: string): Promise<{ pid: number; acquiredAt: number; token?: string }> {
  return JSON.parse(await readFile(path, "utf-8")) as { pid: number; acquiredAt: number; token?: string };
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
    expect(handle.token).toBeTruthy();
    const holder = await readHolder(lockPath);
    expect(holder.pid).toBe(4242);
    expect(holder.acquiredAt).toBe(1000);
    // The per-acquisition token round-trips to the lockfile so release can match it.
    expect(holder.token).toBe(handle.token);
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

  it("never evicts a live holder on age alone — waits, then times out", async () => {
    // A holder whose pid is still alive but whose lock is arbitrarily old. Age is
    // not a reclaim trigger: evicting a slow-but-live holder could let two writers
    // overlap in the critical section, so the contender waits and the bounded wait
    // surfaces a timeout instead.
    await writeFile(lockPath, JSON.stringify({ pid: 1, acquiredAt: 0, token: "held" }), "utf-8");
    const removeFile = vi.fn(async () => {});

    let clock = 0;
    await expect(
      acquireAdvisoryLock(lockPath, {
        pid: 2,
        now: () => (clock += 1000),
        isProcessAlive: () => true,
        removeFile,
        sleep: async () => {},
        maxWaitMs: 50,
      }),
    ).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);

    // The live holder's lock was never broken.
    expect(removeFile).not.toHaveBeenCalled();
    expect((await readHolder(lockPath)).pid).toBe(1);
  });

  it("waits on an unreadable lockfile rather than breaking it", async () => {
    // The lockfile exists but the read itself fails for a reason other than
    // absence (a transient EACCES/EBUSY — plausible on Windows while a live holder
    // has it open). An unverifiable holder must not be broken; the contender waits
    // and times out rather than evicting a possibly-live writer.
    await writeFile(lockPath, JSON.stringify({ pid: 1, acquiredAt: 0, token: "held" }), "utf-8");
    const eacces = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    const readFile = async (): Promise<string> => Promise.reject(eacces);
    const removeFile = vi.fn(async () => {});

    let clock = 0;
    await expect(
      acquireAdvisoryLock(lockPath, {
        pid: 2,
        now: () => (clock += 20),
        isProcessAlive: () => true,
        readFile,
        removeFile,
        sleep: async () => {},
        maxWaitMs: 100,
      }),
    ).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);

    expect(removeFile).not.toHaveBeenCalled();
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
    // The loser fails specifically by timing out on the live winner — not via some
    // other error that would also satisfy a bare rejected-count check.
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AdvisoryLockTimeoutError);

    const winnerPid = (fulfilled[0] as PromiseFulfilledResult<{ pid: number }>).value.pid;
    expect([101, 102]).toContain(winnerPid);
    expect((await readHolder(lockPath)).pid).toBe(winnerPid);
  });

  it("times out instead of spinning when a stale lock can never be removed", async () => {
    // A dead holder (breakable) whose lockfile resists every removal — the remove
    // throws and the file persists, so the exclusive create keeps failing EEXIST.
    await writeFile(lockPath, JSON.stringify({ pid: 9999, acquiredAt: 0 }), "utf-8");

    let clock = 0;
    await expect(
      acquireAdvisoryLock(lockPath, {
        pid: 2,
        now: () => (clock += 10),
        isProcessAlive: (pid) => pid !== 9999,
        removeFile: async () => {
          throw Object.assign(new Error("EPERM"), { code: "EPERM" });
        },
        sleep: async () => {},
        maxWaitMs: 100,
      }),
    ).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);
  });

  it("re-reads an observed-empty lockfile rather than breaking it mid-write", async () => {
    // The winner's exclusive create precedes its content write: the file is empty
    // on the first reads, then the live holder's record lands. A contender must
    // not mistake that window for a husk and break a freshly-taken lock.
    await writeFile(lockPath, "", "utf-8");
    let reads = 0;
    const readFile = async (): Promise<string> => {
      reads += 1;
      return reads >= 3 ? JSON.stringify({ pid: 1, acquiredAt: 0, token: "winner" }) : "";
    };
    const removeFile = vi.fn(async () => {});

    let clock = 0;
    await expect(
      acquireAdvisoryLock(lockPath, {
        pid: 2,
        now: () => (clock += 20),
        isProcessAlive: () => true,
        readFile,
        removeFile,
        sleep: async () => {},
        maxWaitMs: 200,
      }),
    ).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);

    // The empty window resolved to the live winner, so the lock was waited on —
    // never broken.
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(removeFile).not.toHaveBeenCalled();
  });

  it("breaks a lockfile that stays empty past the read-back budget (abandoned husk)", async () => {
    // An empty file that never fills — a crashed winner that created but never
    // wrote. After the bounded read-back it is judged a husk and reclaimed.
    await writeFile(lockPath, "", "utf-8");

    const handle = await acquireAdvisoryLock(lockPath, {
      pid: 2,
      now: () => 0,
      isProcessAlive: () => true,
      sleep: async () => {},
      maxWaitMs: 1_000_000,
    });

    expect(handle.pid).toBe(2);
    expect((await readHolder(lockPath)).pid).toBe(2);
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
    const handle = { path: lockPath, pid: 5, token: "ours" };
    await writeFile(lockPath, JSON.stringify({ pid: 6, acquiredAt: 0, token: "theirs" }), "utf-8");

    await releaseAdvisoryLock(handle);

    expect(await exists(lockPath)).toBe(true);
    expect((await readHolder(lockPath)).pid).toBe(6);
  });

  it("never drops a same-pid sibling's lock — the token must match", async () => {
    // Same process, two overlapping acquisitions: the on-disk holder shares our
    // pid but carries a different token. Pid alone would wrongly drop it.
    const handle = { path: lockPath, pid: 5, token: "first" };
    await writeFile(lockPath, JSON.stringify({ pid: 5, acquiredAt: 0, token: "second" }), "utf-8");

    await releaseAdvisoryLock(handle);

    expect(await exists(lockPath)).toBe(true);
    expect((await readHolder(lockPath)).token).toBe("second");
  });

  it("tolerates an already-absent lock", async () => {
    await expect(releaseAdvisoryLock({ path: lockPath, pid: 5, token: "x" })).resolves.toBeUndefined();
  });
});

describe("getNotesLockPath", () => {
  it("resolves the notes lockfile under the git common dir", async () => {
    const exec = vi.fn(async () => ({ stdout: "/repo/.git\n", stderr: "" }));

    const path = await getNotesLockPath(exec, "/repo/worktree-a", "andrew");

    expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--git-common-dir"], { cwd: "/repo/worktree-a" });
    expect(path).toBe(join("/repo", ".git", "arc", "user", "andrew", ".internal", ".notes.lock"));
  });

  it("normalizes a relative git common dir against the worktree cwd", async () => {
    const exec = vi.fn(async () => ({ stdout: ".git\n", stderr: "" }));

    await expect(getNotesLockPath(exec, "/repo", "andrew")).resolves.toBe(
      join(resolve("/repo", ".git"), "arc", "user", "andrew", ".internal", ".notes.lock"),
    );
  });
});
