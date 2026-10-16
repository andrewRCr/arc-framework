import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { acquireAdvisoryLock, acquireAdvisoryLocks, AdvisoryLockTimeoutError, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { atomicCreateFile } from "../../src/lib/fs.js";

describe("advisory lock sets", () => {
  it("deduplicates and orders opposite overlapping requests so both holders complete", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-lock-set-"));
    onTestFinished(() => rm(root, { recursive: true, force: true }));
    const a = join(root, "a.lock");
    const b = join(root, "b.lock");
    const hold = async (paths: string[]) => {
      const handles = await acquireAdvisoryLocks(paths, { maxWaitMs: 500 });
      try {
        expect(handles.map((handle) => handle.path)).toEqual([a, b]);
        for (const handle of handles) {
          expect(JSON.parse(await readFile(handle.path, "utf8"))).toMatchObject({ token: handle.token });
        }
      } finally { await Promise.all(handles.map((handle) => releaseAdvisoryLock(handle))); }
    };
    const results = await Promise.allSettled([hold([b, a, b]), hold([a, b])]);
    expect(results).toEqual([{ status: "fulfilled", value: undefined }, { status: "fulfilled", value: undefined }]);
  });
  it.each([false, true])("releases every partial acquisition after timeout, with cleanup failure=%s", async (failCleanup) => {
    const root = await mkdtemp(join(tmpdir(), "arc-lock-rollback-"));
    onTestFinished(() => rm(root, { recursive: true, force: true }));
    const paths = ["a", "b", "c"].map((name) => join(root, `${name}.lock`));
    const [a, b, c] = paths as [string, string, string];
    const held = await acquireAdvisoryLock(c);
    const cleanupError = new Error("Injected release failure");
    let failure: unknown;
    try {
      await acquireAdvisoryLocks(paths, { maxWaitMs: 20, exclusiveCreate: async (path, content) => {
        if (failCleanup && path === `${b}.break`) throw cleanupError;
        await atomicCreateFile(path, content);
      } });
    } catch (error) { failure = error; }
    finally { await releaseAdvisoryLock(held); }
    const timeout = failCleanup ? (failure as AggregateError)?.errors?.[0] : failure;
    expect(timeout).toBeInstanceOf(AdvisoryLockTimeoutError);
    expect(timeout).toMatchObject({ lockPath: c, waitedMs: 20, phase: "acquire" });
    if (failCleanup) expect((failure as AggregateError).errors).toContain(cleanupError);
    await expect(readFile(a)).rejects.toMatchObject({ code: "ENOENT" });
    if (!failCleanup) await expect(readFile(b)).rejects.toMatchObject({ code: "ENOENT" });
    // An earlier handle must be attempted even when a later handle's release failed.
    const retry = await acquireAdvisoryLock(a, { maxWaitMs: 20 });
    await releaseAdvisoryLock(retry);
  });
});
