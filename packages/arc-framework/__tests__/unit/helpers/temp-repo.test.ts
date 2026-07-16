/**
 * Tests for the retry-safe git-backed removal primitive.
 *
 * The common-case and missing-path behaviors run against real filesystem
 * teardown; the transient-race and budget-exhaustion branches inject a fake
 * removal so the retry logic is exercised deterministically without depending
 * on a live git-gc race.
 */

import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { removeGitBackedDir, removeGitBackedDirs } from "../../helpers/temp-repo.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** A removal stub that raises the given errno on its first `count` calls, then resolves. */
function failingRemove(code: string, failFirst: number): () => Promise<void> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls <= failFirst) {
      const err = new Error(code) as NodeJS.ErrnoException;
      err.code = code;
      throw err;
    }
  };
}

const noSleep = async (): Promise<void> => {};

describe("removeGitBackedDir", () => {
  it("removes a populated directory tree in the common case", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arc-rm-common-"));
    await mkdir(join(dir, "nested", "deep"), { recursive: true });
    await writeFile(join(dir, "nested", "deep", "file.txt"), "content");

    await removeGitBackedDir(dir);

    expect(await pathExists(dir)).toBe(false);
  });

  it("retries and succeeds when the first removal raises ENOTEMPTY, then the path clears", async () => {
    const remove = failingRemove("ENOTEMPTY", 1);

    // Without retry, the first-attempt ENOTEMPTY would reject; recovering to a
    // clean resolve is the observable behavior.
    await expect(
      removeGitBackedDir("/does/not/matter", { remove, sleep: noSleep }),
    ).resolves.toBeUndefined();
  });

  it("gives up after the bounded attempt budget and throws naming the path and last errno", async () => {
    const remove = vi.fn(failingRemove("EBUSY", Infinity));

    const error = await removeGitBackedDir("/tmp/arc-stuck-path", {
      remove,
      attempts: 3,
      sleep: noSleep,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("/tmp/arc-stuck-path");
    expect((error as Error).message).toContain("EBUSY");
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it("resolves cleanly when the path is missing (force semantics)", async () => {
    const missing = join(tmpdir(), "arc-rm-missing-does-not-exist-xyz");

    await expect(removeGitBackedDir(missing)).resolves.toBeUndefined();
  });

  it("propagates a non-transient errno immediately without retrying", async () => {
    const remove = vi.fn(failingRemove("EACCES", Infinity));

    const error = await removeGitBackedDir("/tmp/arc-denied", {
      remove,
      attempts: 5,
      sleep: noSleep,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as NodeJS.ErrnoException).code).toBe("EACCES");
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("removeGitBackedDirs", () => {
  it("attempts every removal before propagating a teardown failure", async () => {
    const removed = new Set<string>();
    const remove = async (path: string): Promise<void> => {
      if (path === "/tmp/stuck") throw new Error("stuck teardown diagnostic");
      removed.add(path);
    };

    const error = await removeGitBackedDirs(
      ["/tmp/first", "/tmp/stuck", "/tmp/last"],
      remove,
    ).catch((candidate: unknown) => candidate);

    expect(removed).toEqual(new Set(["/tmp/first", "/tmp/last"]));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("stuck teardown diagnostic");
  });
});
