/** A separate real process owning the same advisory notes lock as production. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { onTestFinished } from "vitest";

export async function holdPersonalLockInProcess(lockPath: string): Promise<() => Promise<void>> {
  const moduleUrl = new URL("../../../src/lib/advisory-lock.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { acquireAdvisoryLock, releaseAdvisoryLock } = await import(${JSON.stringify(moduleUrl)});
    const held = await acquireAdvisoryLock(process.argv[1]);
    process.stdout.write("READY\\n");
    await new Promise((resolve) => process.stdin.once("data", resolve));
    await releaseAdvisoryLock(held);
  `, lockPath], { stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
  onTestFinished(() => { if (child.exitCode === null) child.kill(); });
  await Promise.race([
    once(child.stdout, "data").then(([data]) => { if (!String(data).includes("READY")) throw new Error("Lock holder did not announce readiness"); }),
    once(child, "exit").then(() => { throw new Error(`Lock holder exited before readiness: ${errors}`); }),
  ]);
  return async () => {
    const exit = once(child, "exit");
    child.stdin.end("release\n");
    const [code] = await exit;
    if (code !== 0) throw new Error(`Lock holder failed to release: ${errors}`);
  };
}
