/** Durable checkout lock recovery for terminal Errand close retries. */

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
    if (args.join(" ") === "rev-parse --show-toplevel") return { stdout: `${CHECKOUT}\n`, stderr: "" };
    if (args.join(" ") === "rev-parse --git-path HEAD") {
      return { stdout: "/repo/.git/HEAD\n", stderr: "" };
    }
    throw new Error(`Unexpected Git command: ${args.join(" ")}`);
  };
}

function fakeFileIO(): {
  fileIO: CloseHeadLockFileIO;
  files: Map<string, string>;
  failNextUnlink(): void;
} {
  const files = new Map<string, string>();
  let unlinkFailure: Error | null = null;
  return {
    files,
    failNextUnlink: () => { unlinkFailure = new Error("simulated unlink failure"); },
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
      read: async (path) => {
        const value = files.get(path);
        if (value === undefined) throw errno("not found", "ENOENT");
        return value;
      },
      unlink: async (path) => {
        if (unlinkFailure !== null) {
          const failure = unlinkFailure;
          unlinkFailure = null;
          throw failure;
        }
        if (!files.delete(path)) throw errno("not found", "ENOENT");
      },
    },
  };
}

describe("Errand close HEAD lock", () => {
  it("recovers its exact durable receipt when terminal release failed", async () => {
    const runtime = fakeFileIO();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    runtime.failNextUnlink();

    await expect(acquired.release()).rejects.toThrow("simulated unlink failure");
    expect(runtime.files.has(LOCK_PATH)).toBe(true);

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
    })).resolves.toEqual({ kind: "recovered" });
    expect(runtime.files.has(LOCK_PATH)).toBe(false);
  });

  it("does not remove a receipt owned by another Errand", async () => {
    const runtime = fakeFileIO();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "other", claimId: "d".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
    })).resolves.toEqual({ kind: "absent" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });

  it("treats a concurrent missing lock as successful release", async () => {
    const runtime = fakeFileIO();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    runtime.files.delete(LOCK_PATH);

    await expect(acquired.release()).resolves.toBeUndefined();
  });
});
