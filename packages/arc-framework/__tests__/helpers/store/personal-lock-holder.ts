/** A separate real process owning the same advisory notes lock as production. */
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";

export async function holdPersonalLockInProcess(lockPath: string): Promise<() => Promise<void>> {
  const holder = fileURLToPath(new URL("../../fixtures/store/personal-lock-holder.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", holder, lockPath], { stdio: ["pipe", "pipe", "pipe"] });
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
