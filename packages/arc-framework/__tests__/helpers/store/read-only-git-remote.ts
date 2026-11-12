/** A real Git upload-pack endpoint that refuses publication through its fetch transport. */
import { basename, dirname } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { onTestFinished } from "vitest";

export async function readOnlyGitEndpoint(directory: string): Promise<string> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No loopback port was allocated");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const daemon = spawn("git", ["daemon", "--verbose", "--export-all", "--reuseaddr", "--listen=127.0.0.1", `--port=${port}`, `--base-path=${dirname(directory)}`],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: undefined, LC_ALL: "C" } });
  onTestFinished(async () => {
    if (daemon.exitCode !== null || daemon.signalCode !== null) return;
    const exited = new Promise<void>(resolve => { daemon.once("exit", () => { resolve(); }); });
    daemon.kill(); await exited;
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => { reject(new Error(`Git daemon did not become ready: ${output}`)); }, 5_000);
    const done = (error?: Error): void => { clearTimeout(timeout); if (error) reject(error); else resolve(); };
    daemon.once("error", done);
    daemon.once("exit", () => { done(new Error(`Git daemon exited before readiness: ${output}`)); });
    daemon.stderr.on("data", (bytes: Buffer) => { output += bytes.toString("utf8"); if (output.includes("Ready to rumble")) done(); });
  });
  return `git://127.0.0.1:${port}/${basename(directory)}`;
}

