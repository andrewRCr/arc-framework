/** Concurrency coverage for the latest commit-message retry store. */

import { describe, expect, it } from "vitest";

import { createCommitMessageRetryStore } from "../../../../src/lib/release/commit-message-retry-store.js";
import { COMMIT_MESSAGE_RETRY_FILENAME } from "../../../../src/lib/release/commit-message-retry.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settled) => { resolve = settled; });
  return { promise, resolve };
}

describe("createCommitMessageRetryStore", () => {
  it("does not let cleanup delete a newer retry replacement", async () => {
    const gitDir = "/repo/.git";
    const retryPath = `${gitDir}/${COMMIT_MESSAGE_RETRY_FILENAME}`;
    const firstBytes = Uint8Array.from(Buffer.from("first"));
    const replacementBytes = Uint8Array.from(Buffer.from("replacement"));
    const files = new Map<string, Uint8Array>([[retryPath, firstBytes]]);
    const readStarted = deferred();
    const finishRead = deferred();
    let identifier = 0;
    let lockTail = Promise.resolve();

    const store = createCommitMessageRetryStore({
      resolveGitDir: async () => gitDir,
      randomId: () => String(identifier += 1),
      openPrivate: async (path) => {
        files.set(path, new Uint8Array());
        return {
          writeFile: async (bytes) => { files.set(path, Uint8Array.from(bytes)); },
          close: async () => undefined,
        };
      },
      readFile: async (path) => {
        const snapshot = files.get(path);
        if (snapshot === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        if (path === retryPath && Buffer.from(snapshot).equals(Buffer.from(firstBytes))) {
          readStarted.resolve();
          await finishRead.promise;
        }
        return Uint8Array.from(snapshot);
      },
      rename: async (from, to) => {
        const bytes = files.get(from);
        if (bytes === undefined) throw new Error("missing temporary retry");
        files.delete(from);
        files.set(to, bytes);
      },
      unlink: async (path) => {
        if (!files.delete(path)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      withLock: async (_path, operation) => {
        const previous = lockTail;
        let release!: () => void;
        lockTail = new Promise<void>((settled) => { release = settled; });
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      },
    });

    const cleanup = store.cleanup({ cwd: "/repo", sourcePath: retryPath, bytes: firstBytes });
    await readStarted.promise;
    const replacement = store.persist({ cwd: "/repo", bytes: replacementBytes });
    finishRead.resolve();

    await expect(cleanup).resolves.toBe(true);
    await expect(replacement).resolves.toEqual({ path: retryPath });
    expect(files.get(retryPath)).toEqual(replacementBytes);
  });
});
