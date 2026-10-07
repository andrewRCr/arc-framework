/** Interrupting a queued Native builder preserves the live entry and permits a fresh retry. */
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readSettledLockHolder } from "../helpers/read-lock-holder.js";
import { execa } from "execa";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";
import { readBuildQualification } from "../../src/lib/build-qualification.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";

it("cancels an indefinitely queued public builder and qualifies a fresh retry", async () => {
  const fixture = await makeNativeBuildFixture();
  const script = join(fixture.packageRoot, "src/scripts/run-build.ts");
  try {
    await withBuildArtifactOwnership({ packageRoot: fixture.packageRoot, operation: "cancellation fixture owner" }, async () => {
      let entered!: () => void;
      const waiting = new Promise<void>((resolve) => { entered = resolve; });
      let child!: ReturnType<typeof execFile>;
      const done = new Promise<boolean>((resolve) => {
        child = execFile(process.execPath, ["--import", "tsx", script, "fast"], { cwd: fixture.packageRoot, timeout: 30_000 },
          (error) => { resolve(error !== null); });
      });
      let diagnostics = "";
      child.stderr?.on("data", (bytes: Buffer) => {
        diagnostics += bytes.toString();
        if (diagnostics.includes("held by cancellation fixture owner")) entered();
      });
      try {
        await Promise.race([waiting, done.then(() => { throw new Error("Builder exited before it queued"); })]);
        const lock = await readSettledLockHolder(join(fixture.packageRoot, ".arc-build.lock"));
        expect(child.kill("SIGINT")).toBe(true);
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const stopped = await Promise.race([done.then((failed) => failed ? "cancelled" : "completed"),
          new Promise<string>((resolve) => { timeout = setTimeout(() => resolve("still waiting"), 3_000); })]);
        clearTimeout(timeout);
        expect(stopped).toBe("cancelled");
        expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("previous-live-runtime");
        expect(await readSettledLockHolder(join(fixture.packageRoot, ".arc-build.lock")))
          .toMatchObject({ token: lock.token, pid: lock.pid });
        await expect(readFile(join(fixture.packageRoot, ".config-loads"))).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await done;
      }
    });
    const retry = await execa(process.execPath, ["--import", "tsx", script, "fast"],
      { cwd: fixture.packageRoot, reject: false, timeout: 30_000 });
    expect(retry.exitCode, retry.stderr).toBe(0);
    expect(readBuildQualification(fixture.packageRoot, "runtimeSchema").status).toBe("qualified");
    expect(await readFile(join(fixture.packageRoot, "dist/cli.js"), "utf8")).toContain("new-native-runtime");
    await expect(readFile(join(fixture.packageRoot, ".arc-build.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
}, 60_000);
