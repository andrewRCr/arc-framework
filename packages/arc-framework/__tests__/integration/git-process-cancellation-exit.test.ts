/** A late abort never acts on an exited Git child's PID, which another process may already hold. */
import { spawn } from "node:child_process";
import { expect, it, onTestFinished } from "vitest";
import { bindGitProcessCancellation } from "../../src/lib/git/process-cancellation.js";

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

it("leaves the tree now holding an exited child's PID untouched and reports its descendants unconfirmed", async () => {
  // Stands in for an unrelated process that reused the exited child's PID: a parent holding a sleeping child.
  const holder = spawn(process.execPath, ["-e", [
    "const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
    "process.stdout.write(String(child.pid));",
    "setInterval(() => {}, 1000);",
  ].join("\n")], { stdio: ["ignore", "pipe", "ignore"] });
  const descendant = Number(await new Promise<string>((resolve) => holder.stdout.once("data", (chunk: Buffer) => resolve(chunk.toString()))));
  onTestFinished(() => {
    for (const pid of [descendant, holder.pid]) {
      try { if (pid !== undefined) process.kill(pid, "SIGKILL"); } catch { /* already ended */ }
    }
  });
  const controller = new AbortController();
  const finished: boolean[] = [];
  const dispose = bindGitProcessCancellation({ pid: holder.pid, kill: () => true, exitCode: 0, signalCode: null },
    controller.signal, () => undefined, (unconfirmed) => { finished.push(unconfirmed); });
  controller.abort();
  await dispose();
  expect(finished).toEqual([true]);
  expect(alive(descendant)).toBe(true);
  expect(holder.pid !== undefined && alive(holder.pid)).toBe(true);
});
