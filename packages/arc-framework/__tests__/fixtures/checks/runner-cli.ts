/** Live built-CLI processes and bounded observations for real interruption cases. */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { CLI_PATH, assertCliBuilt } from "../../helpers/cli-spawn.js";

export function startRunnerCli(root: string, environment: NodeJS.ProcessEnv) {
  assertCliBuilt();
  const child = spawn(process.execPath, [CLI_PATH, "check", "run", "example", "--json"], {
    cwd: root, env: { ...process.env, ...environment, ARC_DISABLE_UPDATE_CHECKS: "1", NO_COLOR: "1", FORCE_COLOR: undefined },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "", closed = false;
  child.stdout.on("data", (bytes: Buffer) => { stdout += bytes.toString(); });
  child.stderr.on("data", (bytes: Buffer) => { stderr += bytes.toString(); });
  const completed = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => { closed = true; resolve({ exitCode, signal, stdout, stderr }); });
  });
  return { child, completed, get closed() { return closed; }, get diagnostics() { return stdout + stderr; } };
}

export async function waitForRunnerObservation(path: string, cli?: ReturnType<typeof startRunnerCli>): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { return await readFile(path, "utf8"); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause; }
    if (cli?.closed) throw new Error(`CLI exited before ${basename(path)}: ${cli.diagnostics}`);
    await new Promise(resolve => { setTimeout(resolve, 10); });
  }
  throw new Error(`No runner observation ${basename(path)} arrived: ${cli?.diagnostics ?? "provider did not close"}`);
}
