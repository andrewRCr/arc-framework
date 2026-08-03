/** Durable checkout lock recovery for terminal Errand close retries. */

import { describe, expect, it } from "vitest";

import {
  acquireErrandCloseHeadLock,
  recoverFinalizedErrandCloseHeadLock,
  type CloseHeadLockFileIO,
} from "../../../src/lib/errand/close-head-lock.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { ProcessInspection, ProcessInspector } from "../../../src/lib/locus/process-inspector.js";

const CHECKOUT = "/repo";
const LOCK_PATH = "/repo/.git/HEAD.lock";

function errno(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function fakeGit(): GitExec {
  return async (_command, args) => {
    if (args.join(" ") === "worktree list --porcelain -z") {
      return {
        stdout: `worktree ${CHECKOUT}\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0\0`,
        stderr: "",
      };
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
  failNextWrite(): void;
  failNextUnlink(): void;
  replaceAfterNextRead(bytes: string): void;
} {
  const files = new Map<string, string>();
  let writeFailure: Error | null = null;
  let unlinkFailure: Error | null = null;
  let replacementAfterRead: string | null = null;
  return {
    files,
    failNextWrite: () => { writeFailure = new Error("simulated write failure"); },
    failNextUnlink: () => { unlinkFailure = new Error("simulated unlink failure"); },
    replaceAfterNextRead: (bytes) => { replacementAfterRead = bytes; },
    fileIO: {
      openExclusive: async (path) => {
        if (files.has(path)) throw errno("already exists", "EEXIST");
        files.set(path, "");
        return {
          writeFile: async (data) => {
            if (writeFailure !== null) {
              const failure = writeFailure;
              writeFailure = null;
              throw failure;
            }
            files.set(path, data);
          },
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

function fakeProcessInspector(): {
  inspector: ProcessInspector;
  setInspection(value: ProcessInspection): void;
} {
  let inspection: ProcessInspection = {
    kind: "present",
    pid: process.pid,
    parentPid: process.ppid,
    startToken: "holder-generation",
    commandIdentity: "node",
  };
  return {
    inspector: { kind: "fake", inspect: async () => inspection },
    setInspection: (value) => { inspection = value; },
  };
}

describe("Errand close HEAD lock", () => {
  it("keeps failed receipt initialization from blocking retry", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    runtime.failNextWrite();
    runtime.failNextUnlink();

    await expect(acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toMatchObject({ kind: "error" });

    await expect(acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toMatchObject({ kind: "acquired" });
  });

  it("recovers its exact durable receipt when terminal release failed", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    runtime.failNextUnlink();

    await expect(acquired.release()).rejects.toThrow("simulated unlink failure");
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
    processRuntime.setInspection({ kind: "absent" });

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toEqual({ kind: "recovered" });
    expect(runtime.files.has(LOCK_PATH)).toBe(false);
  });

  it("does not remove a receipt owned by another Errand", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "other", claimId: "d".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toEqual({ kind: "absent" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });

  it("does not recover another claim generation of the same Errand", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    processRuntime.setInspection({ kind: "absent" });
    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      claimId: "d".repeat(32),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toEqual({ kind: "absent" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });

  it("treats a concurrent missing lock as successful release", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    runtime.files.delete(LOCK_PATH);

    await expect(acquired.release()).resolves.toBeUndefined();
  });

  it("defers recovery while the exact receipt holder is live", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toMatchObject({ kind: "blocked" });
    expect(runtime.files.has(LOCK_PATH)).toBe(true);
  });

  it("preserves a replacement lock when the original holder exits after the receipt read", async () => {
    const runtime = fakeFileIO();
    const processRuntime = fakeProcessInspector();
    const acquired = await acquireErrandCloseHeadLock({
      exec: fakeGit(),
      checkoutPath: CHECKOUT,
      identity: { slug: "done", claimId: "c".repeat(32) },
      revalidate: async () => ({ kind: "valid" }),
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    });
    if (acquired.kind !== "acquired") throw new Error("expected acquired lock");
    runtime.replaceAfterNextRead("replacement Git lock");
    processRuntime.setInspection({ kind: "absent" });

    await expect(recoverFinalizedErrandCloseHeadLock({
      exec: fakeGit(),
      slug: "done",
      fileIO: runtime.fileIO,
      inspector: processRuntime.inspector,
    })).resolves.toMatchObject({ kind: "blocked" });
    expect(runtime.files.get(LOCK_PATH)).toBe("replacement Git lock");
  });
});
