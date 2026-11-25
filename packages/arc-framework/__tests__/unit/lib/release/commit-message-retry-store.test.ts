/** Concurrency coverage for the latest commit-message retry store. */

import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";

import { createCommitMessageRetryStore } from "../../../../src/lib/release/commit-message-retry-store.js";
import { COMMIT_MESSAGE_RETRY_FILENAME } from "../../../../src/lib/release/commit-message-retry.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settled) => { resolve = settled; });
  return { promise, resolve };
}

interface StoredFile {
  bytes: Uint8Array;
  identity: string;
}

const REPO_PATH = resolve("/repo");
const GIT_DIR = join(REPO_PATH, ".git");
const RETRY_PATH = join(GIT_DIR, COMMIT_MESSAGE_RETRY_FILENAME);

function createStore(
  files: Map<string, StoredFile>,
  beforeIdentify?: (path: string, file: StoredFile) => Promise<void>,
  beforeRename?: () => Promise<void>,
) {
  let identifier = 0;
  let lockTail = Promise.resolve();
  return createCommitMessageRetryStore({
    resolveGitDir: async () => GIT_DIR,
    randomId: () => String(identifier += 1),
    openPrivate: async (path) => {
      files.set(path, { bytes: new Uint8Array(), identity: path });
      return {
        writeFile: async (bytes) => {
          const file = files.get(path);
          if (file === undefined) throw new Error("missing temporary retry");
          file.bytes = Uint8Array.from(bytes);
        },
        close: async () => undefined,
      };
    },
    identifyFile: async (path) => {
      const file = files.get(path);
      if (file === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      await beforeIdentify?.(path, file);
      return file.identity;
    },
    rename: async (from, to) => {
      await beforeRename?.();
      const file = files.get(from);
      if (file === undefined) throw new Error("missing temporary retry");
      files.delete(from);
      files.set(to, file);
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
}

describe("createCommitMessageRetryStore", () => {
  it("replaces the latest retry after a temporary rename refusal", async () => {
    const retryPath = RETRY_PATH;
    const bytes = Uint8Array.from(Buffer.from("approved message"));
    const files = new Map<string, StoredFile>([[
      retryPath,
      { bytes: Uint8Array.from(Buffer.from("older message")), identity: "older-generation" },
    ]]);
    let attempts = 0;
    const store = createStore(files, undefined, async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("held target"), { code: "EPERM" });
    });

    await expect(store.persist({ cwd: REPO_PATH, bytes })).resolves.toEqual({ path: retryPath });
    expect(files.get(retryPath)?.bytes).toEqual(bytes);
    expect(attempts).toBe(3);
    expect([...files.keys()]).toEqual([retryPath]);
  });

  it("does not let cleanup delete a newer retry replacement", async () => {
    const retryPath = RETRY_PATH;
    const firstBytes = Uint8Array.from(Buffer.from("first"));
    const replacementBytes = Uint8Array.from(Buffer.from("replacement"));
    const files = new Map<string, StoredFile>([[
      retryPath,
      { bytes: firstBytes, identity: "first-generation" },
    ]]);
    const readStarted = deferred();
    const finishRead = deferred();
    const store = createStore(files, async (path, file) => {
      if (path === retryPath && file.identity === "first-generation") {
        readStarted.resolve();
        await finishRead.promise;
      }
    });

    const cleanup = store.cleanup({
      cwd: REPO_PATH,
      sourcePath: retryPath,
      sourceIdentity: "first-generation",
    });
    await readStarted.promise;
    const replacement = store.persist({ cwd: REPO_PATH, bytes: replacementBytes });
    finishRead.resolve();

    await expect(cleanup).resolves.toBe(true);
    await expect(replacement).resolves.toEqual({ path: retryPath });
    expect(files.get(retryPath)?.bytes).toEqual(replacementBytes);
  });

  it("preserves a newer same-byte retry when the older generation cleans up later", async () => {
    const retryPath = RETRY_PATH;
    const bytes = Uint8Array.from(Buffer.from("same approved message"));
    const files = new Map<string, StoredFile>([[
      retryPath,
      { bytes, identity: "consumed-generation" },
    ]]);
    const store = createStore(files);

    await store.persist({ cwd: REPO_PATH, bytes });

    await expect(store.cleanup({
      cwd: REPO_PATH,
      sourcePath: retryPath,
      sourceIdentity: "consumed-generation",
    })).resolves.toBe(false);
    expect(files.get(retryPath)?.bytes).toEqual(bytes);
    expect(files.get(retryPath)?.identity).not.toBe("consumed-generation");
  });
});
