/** Durable retry cleanup for Errand close checkout locks. */

import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import {
  acquireErrandCloseBranchDeletionHeadLocks,
  acquireErrandCloseHeadLock,
  recoverFinalizedErrandCloseHeadLock,
  type CloseHeadLockFileIO,
} from "../../../src/lib/errand/close-head-lock.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

let CHECKOUT: string;
let LOCK_PATH: string;

beforeEach(async () => {
  CHECKOUT = await mkdtemp(join(tmpdir(), "arc-close-head-lock-"));
  LOCK_PATH = join(CHECKOUT, ".git", "HEAD.lock");
});
afterEach(async () => { await rm(CHECKOUT, { recursive: true, force: true }); });

function errno(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fakeGit(): GitExec {
  return scriptGitExec([
    { match: ["worktree", "list", "--porcelain", "-z"],
      responses: [{ stdout: `worktree ${CHECKOUT}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0`, stderr: "" }] },
    { match: ["rev-parse", "--git-path", "HEAD"],
      responses: [{ stdout: `${join(CHECKOUT, ".git", "HEAD")}\n`, stderr: "" }] },
  ]).exec;
}

function fakeFileIO(): {
  fileIO: CloseHeadLockFileIO;
  files: Map<string, string>;
  replaceAfterNextRead(bytes: string): void;
} {
  const files = new Map<string, string>();
  let replacementAfterRead: string | null = null;
  return {
    files,
    replaceAfterNextRead: (bytes) => { replacementAfterRead = bytes; },
    fileIO: {
      openExclusive: async (path) => {
        if (files.has(path)) throw errno("already exists", "EEXIST");
        files.set(path, "");
        return {
          writeFile: async (data) => { files.set(path, data); },
          sync: async () => undefined,
          close: async () => undefined,
        };
      },
      link: async (existingPath, newPath) => {
        if (files.has(newPath)) throw errno("already exists", "EEXIST");
        const value = files.get(existingPath);
        if (value === undefined) throw errno("not found", "ENOENT");
        files.set(newPath, value);
      },
      read: async (path) => {
        const value = files.get(path);
        if (value === undefined) throw errno("not found", "ENOENT");
        if (replacementAfterRead !== null) {
          files.set(path, replacementAfterRead);
          replacementAfterRead = null;
        }
        return value;
      },
      unlink: async (path) => {
        if (!files.delete(path)) throw errno("not found", "ENOENT");
      },
    },
  };
}

async function acquire(runtime: ReturnType<typeof fakeFileIO>, slug = "done") {
  return acquireErrandCloseHeadLock({
    exec: fakeGit(),
    checkoutPath: CHECKOUT,
    identity: { slug, claimId: "c".repeat(32) },
    revalidate: async () => ({ kind: "valid" }),
    fileIO: runtime.fileIO,
  });
}

describe("Errand close HEAD lock", () => {
  it("persists a random lock generation without process-liveness fields", async () => {
    const runtime = fakeFileIO();
    const acquired = await acquire(runtime);

    expect(acquired.kind).toBe("acquired");
    const receipt = JSON.parse(runtime.files.get(LOCK_PATH) ?? "null") as Record<string, unknown>;
    expect(receipt).toMatchObject({ kind: "arc-errand-close-head-lock", slug: "done", checkoutPath: CHECKOUT });
    expect(receipt.generation).toEqual(expect.any(String));
    expect(receipt).not.toHaveProperty("pid");
    expect(receipt).not.toHaveProperty("startToken");
    expect(receipt).not.toHaveProperty("inspector");
  });

  it("recovers an exact ARC-owned receipt after terminal identity absence", async () => {
    const runtime = fakeFileIO();
    const acquired = await acquire(runtime);
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(), slug: "done", fileIO: runtime.fileIO,
    })).resolves.toEqual({ kind: "recovered" });
    expect(runtime.files.has(LOCK_PATH)).toBe(false);
  });

  it("preserves a live holder's receipt against a concurrent close", async () => {
    const runtime = fakeFileIO();
    const first = await acquire(runtime);
    if (first.kind !== "acquired") throw new Error("expected acquired lock");

    await expect(acquire(runtime)).resolves.toMatchObject({
      kind: "refused",
      reason: "role-conflict",
    });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);

    await first.release();
    expect(runtime.files.has(LOCK_PATH)).toBe(false);
  });

  it("preserves a receipt owned by another Errand", async () => {
    const runtime = fakeFileIO();
    await acquire(runtime, "other");

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(), slug: "done", fileIO: runtime.fileIO,
    })).resolves.toEqual({ kind: "absent" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });

  it("preserves a replacement generation published after the receipt read", async () => {
    const runtime = fakeFileIO();
    await acquire(runtime);
    runtime.replaceAfterNextRead(`${JSON.stringify({
      version: 1,
      kind: "arc-errand-close-head-lock",
      slug: "done",
      claimId: "c".repeat(32),
      checkoutPath: CHECKOUT,
      generation: "replacement",
    })}\n`);

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(), slug: "done", fileIO: runtime.fileIO,
    })).resolves.toMatchObject({ kind: "blocked" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });
  it("recovers only the selected claim's receipts when two Errands share a slug", async () => {
    const runtime = fakeFileIO(), otherCheckout = join(CHECKOUT, "other");
    await mkdir(otherCheckout);
    const exec = scriptGitExec([
      { match: ["worktree", "list", "--porcelain", "-z"], responses: [{ stdout:
        `worktree ${CHECKOUT}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0worktree ${otherCheckout}\0HEAD ${"a".repeat(40)}\0branch refs/heads/chore/done\0\0`, stderr: "" }] },
      { match: ["rev-parse", "--git-path", "HEAD"], responses: [call => ({ stdout: `${call.options?.cwd}/.git/HEAD\n`, stderr: "" })] },
    ]).exec;
    for (const [checkoutPath, claimId] of [[CHECKOUT, "a".repeat(32)], [otherCheckout, "b".repeat(32)]] as const) {
      expect(await acquireErrandCloseHeadLock({ exec, checkoutPath, identity: { slug: "done", claimId },
        revalidate: async () => ({ kind: "valid" }), fileIO: runtime.fileIO })).toMatchObject({ kind: "acquired" });
    }
    const otherLock = `${otherCheckout}/.git/HEAD.lock`, otherReceipt = runtime.files.get(otherLock);
    expect(await recoverFinalizedErrandCloseHeadLock({ exec, slug: "done", claimId: "a".repeat(32), fileIO: runtime.fileIO }))
      .toEqual({ kind: "recovered" });
    expect(runtime.files.has(LOCK_PATH)).toBe(false);
    expect(runtime.files.get(otherLock)).toBe(otherReceipt);
  });

  function topologyGit(options: {
    missingBranch?: string;
    locked?: string | null;
    onScan?: (scan: number, missingPath: string) => Promise<void>;
    headFailure?: () => boolean;
  } = {}): GitExec {
    let scan = 0;
    const missingPath = join(CHECKOUT, "missing");
    return scriptGitExec([
      { match: ["worktree", "list", "--porcelain", "-z"], responses: [async () => {
        await options.onScan?.(++scan, missingPath);
        return { stdout: `worktree ${CHECKOUT}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0`
          + `worktree ${missingPath}\0HEAD ${"a".repeat(40)}\0`
          + (options.missingBranch === undefined ? "detached\0" : `branch refs/heads/${options.missingBranch}\0`)
          + (options.locked === undefined ? "prunable gitdir file points to non-existent location\0"
            : `locked${options.locked === null ? "" : ` ${options.locked}`}\0`) + "\0", stderr: "" };
      }] },
      { match: ["rev-parse", "--git-path", "HEAD"], responses: [async (call) => {
        await access(call.options?.cwd ?? "");
        if (options.headFailure?.()) throw new Error("cannot read HEAD");
        return { stdout: `${call.options?.cwd}/.git/HEAD\n`, stderr: "" };
      }] },
    ]).exec;
  }

  it.each([undefined, "chore/done"])("locks live checkouts while ignoring a missing registration on %s", async (missingBranch) => {
    const runtime = fakeFileIO();
    const lease = await acquireErrandCloseBranchDeletionHeadLocks({
      exec: topologyGit(missingBranch === undefined ? {} : { missingBranch }),
      identity: { slug: "done", claimId: "c".repeat(32) }, branch: "chore/done", guard: null,
      fileIO: runtime.fileIO,
    });
    expect(lease.kind).toBe("acquired");
    if (lease.kind !== "acquired") throw new Error(JSON.stringify(lease));
    expect([...runtime.files.keys()]).toEqual([LOCK_PATH]);
    await lease.release();
    expect(runtime.files.size).toBe(0);
  });

  it("recovers a live checkout's receipt while an unrelated registered folder is missing", async () => {
    const runtime = fakeFileIO();
    await acquire(runtime);
    expect(await recoverFinalizedErrandCloseHeadLock({
      exec: topologyGit(), slug: "done", fileIO: runtime.fileIO,
    })).toEqual({ kind: "recovered" });
    expect(runtime.files.size).toBe(0);
  });

  it("refuses a missing registration restored during locking, then permits a retry after removal", async () => {
    const runtime = fakeFileIO();
    const options = { identity: { slug: "done", claimId: "c".repeat(32) }, branch: "chore/done",
      guard: null, fileIO: runtime.fileIO };
    const refused = await acquireErrandCloseBranchDeletionHeadLocks({ ...options,
      exec: topologyGit({ onScan: async (scan, missingPath) => { if (scan === 3) await mkdir(missingPath); } }),
    });
    expect(refused).toMatchObject({ kind: "refused", message: expect.stringContaining("topology changed") });
    expect(runtime.files.size).toBe(0);
    await rm(join(CHECKOUT, "missing"), { recursive: true });
    const retried = await acquireErrandCloseBranchDeletionHeadLocks({ ...options, exec: topologyGit() });
    expect(retried.kind).toBe("acquired");
    if (retried.kind === "acquired") await retried.release();
    expect(runtime.files.size).toBe(0);
  });

  it("names a live checkout's HEAD-path failure and repair before a successful retry", async () => {
    const runtime = fakeFileIO();
    let failed = true;
    const options = { exec: topologyGit({ headFailure: () => failed }), checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" as const }), fileIO: runtime.fileIO };
    const refusal = await acquireErrandCloseHeadLock(options);
    expect(refusal).toMatchObject({ kind: "error", message: expect.stringContaining(CHECKOUT) });
    expect(refusal).toMatchObject({ message: expect.stringContaining("retry") });
    expect(runtime.files.size).toBe(0);
    failed = false;
    const retried = await acquireErrandCloseHeadLock(options);
    expect(retried.kind).toBe("acquired");
    if (retried.kind === "acquired") await retried.release();
    expect(runtime.files.size).toBe(0);
  });

  it.each([null, "portable storage"])("retains a missing worktree's branch under lock %s, then retries after unlock", async (locked) => {
    const runtime = fakeFileIO();
    const options = { identity: { slug: "done", claimId: "c".repeat(32) }, branch: "chore/done",
      guard: null, fileIO: runtime.fileIO };
    const refused = await acquireErrandCloseBranchDeletionHeadLocks({ ...options,
      exec: topologyGit({ missingBranch: "chore/done", locked }),
    });
    expect(refused).toMatchObject({ kind: "refused", message: expect.stringContaining(join(CHECKOUT, "missing")) });
    expect(refused).toMatchObject({ message: expect.stringContaining("unlock") });
    expect(runtime.files.size).toBe(0);
    const retried = await acquireErrandCloseBranchDeletionHeadLocks({ ...options,
      exec: topologyGit({ missingBranch: "chore/done" }),
    });
    expect(retried.kind).toBe("acquired");
    if (retried.kind === "acquired") await retried.release();
    expect(runtime.files.size).toBe(0);
  });

});
