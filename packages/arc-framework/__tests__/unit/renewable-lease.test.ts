/** Observable cleanup protection around a renewable owning action. */
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  acquireAdvisoryLock, releaseAdvisoryLock, releaseAdvisoryLockConfirmed,
} from "../../src/lib/advisory-lock.js";
import { withRenewableLease, type RenewableLeaseDependencies } from "../../src/lib/renewable-lease.js";

describe("withRenewableLease", () => {
  it.each(["no-op", "denied"])("refuses an unconfirmed %s native release and permits repair", async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "arc-confirmed-release-"));
    const handle = await acquireAdvisoryLock(join(root, ".lock"));
    try {
      await expect(releaseAdvisoryLockConfirmed(handle, {
        removeFile: async (path) => {
          if (path !== handle.path) await unlink(path);
          else if (mode === "denied") throw Object.assign(new Error("denied"), { code: "EACCES" });
        },
      })).rejects.toThrow(/release.*confirm|confirm.*release/iu);
      expect(JSON.parse(await readFile(handle.path, "utf8"))).toMatchObject({ token: handle.token });
      await releaseAdvisoryLockConfirmed(handle);
      await expect(readFile(handle.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await releaseAdvisoryLock(handle);
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retains process cleanup and renewal when release rejects", async () => {
    let exitProtected = false;
    let renewing = false;
    const failure = new Error("filesystem busy");
    const deps: RenewableLeaseDependencies = {
      now: () => 1_000,
      registerExitCleanup: () => { exitProtected = true; return () => { exitProtected = false; }; },
      releaseLock: async () => { throw failure; },
      renewLock: async () => "renewed",
      scheduleEvery: () => { renewing = true; return () => { renewing = false; }; },
      terminateProcess: () => {}, writeLine: () => {},
    };
    await expect(withRenewableLease(
      { path: "/lock", pid: 42, token: "ours", leaseUntil: 121_000 }, 1_000, async () => "complete", deps,
      { lock: "Artifact lock", controller: "the build controller" },
    )).rejects.toBe(failure);
    expect(exitProtected).toBe(true);
    expect(renewing).toBe(true);
  });
});
