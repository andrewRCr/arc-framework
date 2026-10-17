/** Bounded process lifecycle and validated output for real store writers. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { onTestFinished } from "vitest";
import { RefProcessJobSchema, RefProcessReportSchema, type RefProcessJob, type RefProcessReport } from "../../fixtures/store/ref-process-protocol.js";

export function startRefWriter(root: string, input: RefProcessJob) {
  const job = RefProcessJobSchema.parse(input);
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../fixtures/store/ref-process-writer.ts", import.meta.url)), root, JSON.stringify(job)],
    { stdio: ["pipe", "pipe", "pipe"], env });
  let errors = "", payload: RefProcessReport | undefined;
  let announce: () => void = () => {};
  let failReady: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => { announce = resolve; failReady = reject; });
  // A lifecycle writer has no pause; callers need only its result.
  void ready.catch(() => {});
  child.stderr.on("data", (data: Buffer) => { errors += data.toString(); });
  const lines = createInterface({ input: child.stdout });
  let parseFailure: unknown;
  lines.on("line", (line) => {
    if (line === "READY") { announce(); return; }
    try { payload = RefProcessReportSchema.parse(JSON.parse(line)); } catch (error) { parseFailure = error; }
  });
  const result = new Promise<RefProcessReport>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Writer exceeded 60s: ${errors}`)); }, 60_000);
    child.on("error", (error) => { clearTimeout(timeout); failReady(error); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const error = new Error(`Writer exited ${code}: ${errors}${parseFailure ? String(parseFailure) : ""}`);
      failReady(error);
      if (code !== 0 || !payload || parseFailure) reject(error); else resolve(payload);
    });
  });
  void result.catch(() => {});
  onTestFinished(() => { if (child.exitCode === null) child.kill(); });
  return { ready, result, resume: () => { child.stdin.end("continue\n"); } };
}
