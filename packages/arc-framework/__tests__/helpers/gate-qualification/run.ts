/** Separate gate processes preserve process-global native environment and controller state. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import type { GateSample, GateTrial, GateTrialReport } from "./model.js";

/** Launch exactly one complete gate; callers interleave or overlap trials explicitly. */
export async function runGateChild(trial: GateTrial, controllerPrefix: readonly string[] = []): Promise<GateSample> {
  const output = resolve(trial.outputDirectory), checkout = resolve(trial.checkout);
  const inside = relative(checkout, output);
  if (inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))) {
    throw new Error("Gate artifacts must be outside the fixed source checkout.");
  }
  if (!Number.isFinite(trial.timeoutMs) || trial.timeoutMs < 1_000) throw new Error("A positive bounded gate timeout is required.");
  const startedAt = Date.now(), started = performance.now();
  await mkdir(dirname(output), { recursive: true });
  try { await mkdir(output); }
  catch (cause) { throw new Error(`Fresh trial output directory required; retained earlier artifacts at ${output}.`, { cause }); }
  const requestFile = join(output, "request.json"), reportFile = join(output, "gate.json");
  await writeFile(requestFile, JSON.stringify({ ...trial, checkout, outputDirectory: output }, null, 2));
  const environment = Object.fromEntries(Object.entries({ ...process.env, ...trial.environment })
    .filter((entry): entry is [string, string | undefined] => entry[1] !== null));
  const command = [...controllerPrefix, process.execPath, "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("./child.ts", import.meta.url)), requestFile, reportFile];
  const result = await execa(command[0]!, command.slice(1), { cwd: checkout, env: environment, extendEnv: false,
    reject: false, timeout: trial.timeoutMs, killSignal: "SIGTERM", forceKillAfterDelay: 10_000 });
  await Promise.all([writeFile(join(output, "controller.stdout"), result.stdout), writeFile(join(output, "controller.stderr"), result.stderr)]);
  let report: GateTrialReport | undefined, failure: string | undefined, rejectedReport: unknown;
  try {
    const candidate = JSON.parse(await readFile(reportFile, "utf8")) as GateTrialReport;
    if (candidate === null || candidate.version !== 1 || ["id", "pairId", "batchId", "arm", "gate"].some(key =>
      candidate[key as keyof GateTrialReport] !== trial[key as keyof GateTrial])) {
      rejectedReport = candidate;
      failure = "Controller report identity differs from its fixed trial; raw report retained.";
    } else report = candidate;
  }
  catch (cause) { failure = `Controller report unavailable: ${String(cause)}`; }
  const sample: GateSample = { request: { id: trial.id, pairId: trial.pairId, batchId: trial.batchId, arm: trial.arm, gate: trial.gate },
    startedAt, finishedAt: Date.now(), collectionMs: performance.now() - started,
    processExit: { exitCode: result.exitCode, signal: result.signal, timedOut: result.timedOut },
    stdout: result.stdout, stderr: result.stderr, report, rejectedReport, failure };
  await writeFile(join(output, "sample.json"), JSON.stringify(sample, null, 2));
  return sample;
}
