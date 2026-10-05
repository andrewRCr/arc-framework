/** Advisory critical-section outcomes exercised through actual lockfiles. */

import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withAdvisoryLock, type AdvisoryLockOptions } from "../../src/lib/advisory-lock.js";

let directory: string;
let lockPath: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arc-lock-scope-"));
  lockPath = join(directory, "scope.lock");
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }
function failedRelease(error: Error): AdvisoryLockOptions {
  return { exclusiveCreate: async (path, content) => {
    if (path.endsWith(".break")) throw error;
    await writeFile(path, content, { flag: "wx" });
  } };
}

describe("withAdvisoryLock", () => {
  it("holds the lock through a successful operation and releases before returning its exact result", async () => {
    const expected = { value: 42 };
    const result = await withAdvisoryLock(lockPath, async (heldPath) => {
      expect(heldPath).toBe(lockPath);
      expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({ pid: process.pid, token: expect.any(String) });
      return expected;
    });
    expect(result).toBe(expected);
    expect(await exists(lockPath)).toBe(false);
    expect(await exists(`${lockPath}.break`)).toBe(false);
  });

  it("releases after an operation fails and preserves that error", async () => {
    const failure = new Error("Operation failed");
    await expect(withAdvisoryLock(lockPath, async () => { throw failure; })).rejects.toBe(failure);
    expect(await exists(lockPath)).toBe(false);
  });

  it("surfaces release failure after a successful operation", async () => {
    const failure = new Error("Release cannot acquire maintenance");
    await expect(withAdvisoryLock(lockPath, async () => "result", failedRelease(failure))).rejects.toBe(failure);
    expect(await exists(lockPath)).toBe(true);
  });

  it("surfaces both errors with the operation error as message and cause", async () => {
    const operation = new Error("Operation failed");
    const release = new Error("Release failed");
    let failure: unknown;
    try { await withAdvisoryLock(lockPath, async () => { throw operation; }, failedRelease(release)); }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure).toMatchObject({ errors: [operation, release], message: operation.message, cause: operation });
    expect(await exists(lockPath)).toBe(true);
  });
});
