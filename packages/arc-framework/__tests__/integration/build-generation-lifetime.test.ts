/** Native compiler children remain staging-only while owning process renewal stays asynchronous. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { readSettledLockHolder } from "../helpers/read-lock-holder.js";
import { BUILD_ARTIFACT_LOCK_NAME, withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { BUILD_COMPILER_REPORT_NAME } from "../../src/scripts/build-compiler.js";
import { startBlockedBuildController } from "../helpers/native-build-controller.js";

it("renews native artifact ownership while the compiler child is blocked", async () => {
  const fixture = await startBlockedBuildController();
  try {
    await Promise.race([fixture.done.then(() => { throw new Error("Owner exited before compiler readiness"); }),
      vi.waitFor(async () => { expect(await readFile(fixture.readyPath, "utf8")).not.toBe(""); }, { timeout: 15_000 })]);
    const lockPath = join(fixture.packageRoot, BUILD_ARTIFACT_LOCK_NAME);
    const before = await readSettledLockHolder(lockPath);
    await vi.waitFor(async () => {
      const after = await readSettledLockHolder(lockPath);
      expect(after.leaseUntil).toBeGreaterThan(before.leaseUntil!);
    });
    expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
    await writeFile(fixture.releasePath, "release");
    await fixture.done;
    expect(await readFile(join(fixture.packageRoot, ".owner-finished"), "utf8")).toContain(".arc-dev-build-");
  } finally {
    await writeFile(fixture.releasePath, "release");
    await fixture.done.catch(() => undefined);
    await rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);

it("permits a surviving child to finish staging after owner death without publishing", async () => {
  const fixture = await startBlockedBuildController(true);
  try {
    let ready!: { pid: number; directory: string };
    await Promise.race([fixture.done.then(() => { throw new Error("Owner exited before compiler readiness"); }),
      vi.waitFor(async () => {
      ready = JSON.parse(await readFile(fixture.readyPath, "utf8")) as typeof ready;
      expect(ready.pid).toBeGreaterThan(0);
    }, { timeout: 15_000 })]);
    fixture.owner.kill("SIGKILL");
    await expect(fixture.done).rejects.toBeInstanceOf(Error);
    let compilerAliveAfterOwnerDeath: boolean | undefined;
    if (process.platform === "win32") {
      compilerAliveAfterOwnerDeath = true;
      try { process.kill(ready.pid, 0); } catch { compilerAliveAfterOwnerDeath = false; }
      expect(compilerAliveAfterOwnerDeath).toBe(true);
    }
    await withBuildArtifactOwnership({ packageRoot: fixture.packageRoot, operation: "repaired owner" }, async (lease) => {
      await lease.confirmOwnership();
      await writeFile(fixture.releasePath, "release");
      await vi.waitFor(async () => {
        expect(JSON.parse(await readFile(join(ready.directory, BUILD_COMPILER_REPORT_NAME), "utf8")))
          .toHaveProperty("mode", "fast");
      }, { timeout: 15_000 }).catch(async (error: unknown) => {
        if (process.platform !== "win32") throw error;
        let compilerAlive = true;
        try { process.kill(ready.pid, 0); } catch { compilerAlive = false; }
        const diagnostics = await readFile(join(fixture.packageRoot, ".compiler-diagnostics"), "utf8")
          .catch(() => "No compiler diagnostics recorded");
        throw new Error(`Compiler PID ${ready.pid}; owner PID ${fixture.owner.pid}; alive after owner death: ${compilerAliveAfterOwnerDeath}; alive at timeout: ${compilerAlive}; `
          + diagnostics, { cause: error });
      });
      expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
      expect(await readFile(join(ready.directory, "cli.js"), "utf8")).toContain("new-native-runtime");
    });
  } finally {
    fixture.owner.kill("SIGKILL");
    await writeFile(fixture.releasePath, "release");
    await fixture.done.catch(() => undefined);
    await fixture.cleanupCompiler();
    await rm(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}, 30_000);
