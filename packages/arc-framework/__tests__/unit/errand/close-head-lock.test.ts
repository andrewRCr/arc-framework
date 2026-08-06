/** Durable retry cleanup for Errand close checkout locks. */

import { describe, expect, it } from "vitest";

import {
  acquireErrandCloseHeadLock,
  recoverFinalizedErrandCloseHeadLock,
  type CloseHeadLockFileIO,
} from "../../../src/lib/errand/close-head-lock.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const CHECKOUT = "/repo";
const LOCK_PATH = "/repo/.git/HEAD.lock";

function errno(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fakeGit(): GitExec {
  return async (_command, args) => {
    if (args.join(" ") === "worktree list --porcelain -z") {
      return { stdout: `worktree ${CHECKOUT}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0`, stderr: "" };
    }
    if (args.join(" ") === "rev-parse --git-path HEAD") {
      return { stdout: "/repo/.git/HEAD\n", stderr: "" };
    }
    throw new Error(`Unexpected Git command: ${args.join(" ")}`);
  };
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
});
