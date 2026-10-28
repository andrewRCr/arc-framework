#!/usr/bin/env node
/** Standalone NDJSON adapter with serial Linux process-group supervision. */
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { childDirectory, childEnvironment, readChildNotice, verifyInputs } from "./local-inputs.mjs";
import { executeChild, IncompleteExecutionError, inspectAttempt, ownerRecord, runWorker } from "./local-process.mjs";
import { qualifyNodeRuntime } from "./local-runtime.mjs";

const executable = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
if (args[0] === "--worker") await runWorker(args[1], args[2]);
else await main();

// Attempt records direct which process groups --settle signals, so only this user may write them.
async function ownedStateRoot(stateRoot, create) {
  if (!isAbsolute(stateRoot)) throw new Error("--state-root must name an absolute directory");
  if (create) await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  let stat;
  try { stat = await lstat(stateRoot); }
  catch (error) { if (!create && error.code === "ENOENT") return false; throw error; }
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0) {
    throw new Error(`State root ${JSON.stringify(stateRoot)} must be a directory owned by this user and writable by no one else`);
  }
  return true;
}

async function main() {
  const stateOption = args.indexOf("--state-root");
  const stateRoot = stateOption < 0 ? join(homedir(), ".cache", "arc-local-check-runner") : args[stateOption + 1] ?? "";
  if (args[0] === "--inspect" || args[0] === "--settle") {
    if (!/^[0-9a-f-]{36}$/u.test(args[1] ?? "")) throw new Error("Supply the caller's plan UUID");
    const result = await ownedStateRoot(stateRoot, false) ? await inspectAttempt(join(stateRoot, args[1]), args[0] === "--settle")
      : { planId: args[1], status: "settled", workers: [] };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "settled" ? 0 : 1;
    return;
  }
  let plan;
  let directory;
  let contextId;
  let runtime;
  let administration;
  let busy;
  let ended = false;
  let failed = false;
  let writing = Promise.resolve();
  const used = new Set();
  const control = { cancelled: false, active: undefined };
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => { control.cancelled = true; control.active?.stop(); };
  const send = message => {
    writing = writing.then(() => new Promise((accept, reject) => {
      process.stdout.write(`${JSON.stringify(message)}\n`, error => { if (error) reject(error); else accept(); });
    }));
    return writing;
  };
  const reply = (request, result) => send({ jsonrpc: "2.0", id: request.id, result });
  const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
  const fail = () => { failed = true; stop(); lines.close(); process.stdin.destroy(); };
  process.stdout.on("error", fail);
  process.stdin.on("error", fail);
  process.on("SIGTERM", () => { stop(); lines.close(); process.stdin.destroy(); });
  lines.on("close", () => { ended = true; stop(); });
  const probe = async invocation => {
    const noticeDirectory = await mkdtemp(join(directory, "probe-")).catch(() => undefined);
    const output = [];
    let bytes = 0;
    try {
      const outcome = await executeChild(executable, directory, { ...invocation, shell: false },
        await childDirectory(plan.source.root, invocation.cwd),
        childEnvironment(plan, invocation, noticeDirectory === undefined ? undefined : join(noticeDirectory, "notice")), 300000,
        (stream, chunk) => {
          if (stream !== "stdout") return;
          bytes += chunk.length;
          if (bytes <= 1024 * 1024) output.push(chunk);
          else control.active?.stop();
        }, control);
      return { outcome, stdout: Buffer.concat(output), overflow: bytes > 1024 * 1024 };
    } finally { if (noticeDirectory !== undefined && control.active === undefined) await rm(noticeDirectory, { recursive: true, force: true }).catch(() => undefined); }
  };
  const prepare = async request => {
    plan = request.params;
    let acquired = false;
    try {
      if (process.platform !== "linux") throw new Error("This example requires Linux /proc and POSIX process groups");
      if (plan.protocolVersion !== 1 || !/^[0-9a-f-]{36}$/u.test(plan.planId)) throw new Error("Unsupported protocol or invalid attempt UUID");
      directory = join(stateRoot, plan.planId);
      await notify("check/recovery", { planId: plan.planId, instructions:
        `Inspect with ${JSON.stringify(process.execPath)} ${JSON.stringify(executable)} --inspect ${plan.planId} --state-root ${JSON.stringify(stateRoot)}; `
        + `settle with the same command using --settle. Inspect must report settled before removing retained captures.` });
      await ownedStateRoot(stateRoot, true);
      await mkdir(directory, { mode: 0o700 });
      acquired = true;
      await writeFile(join(directory, "owner.json"), JSON.stringify({ ...await ownerRecord(), planId: plan.planId }), { flag: "wx", mode: 0o600 });
      administration = await verifyInputs(plan);
      for (const invocation of plan.invocations) await childDirectory(plan.source.root, invocation.cwd);
      runtime = args.includes("--known-node-runtime") ? await qualifyNodeRuntime(plan, probe)
        : { kind: "unknown", reason: "This local example has no reusable runtime qualification." };
      await verifyInputs(plan, administration);
      if (control.cancelled) throw new Error("Preparation was cancelled");
      contextId = randomUUID();
      await reply(request, { status: "ready", planId: plan.planId, contextId, sourceDigest: plan.source.digest,
        capabilities: { runGroup: false }, runtime });
    } catch (error) {
      if (acquired && directory !== undefined) await rm(directory, { recursive: true, force: true });
      directory = undefined;
      await reply(request, { status: "unavailable", planId: plan.planId, reason: error.message,
        remedy: "Repair the local adapter or captured inputs and retry with a fresh attempt.", settled: true });
    }
  };
  const run = async request => {
    const id = request.params.invocationId;
    const invocation = plan.invocations.find(item => item.id === id);
    if (request.params.contextId !== contextId || invocation === undefined || used.has(id)) throw new Error("Invalid context or repeated/unplanned invocation");
    used.add(id);
    let outcome;
    let reported;
    let noticeDirectory;
    try {
      if (control.cancelled) throw new Error("Attempt is cancelled; retry with a fresh attempt");
      await verifyInputs(plan, administration);
      if (runtime.kind === "known" && JSON.stringify(await qualifyNodeRuntime(plan, probe)) !== JSON.stringify(runtime)) {
        throw new Error("Prepared Node runtime changed; retry explicitly with fresh qualification");
      }
      const cwd = await childDirectory(plan.source.root, invocation.cwd);
      noticeDirectory = await mkdtemp(join(directory, "notice-")).catch(() => undefined);
      const notice = noticeDirectory === undefined ? undefined : join(noticeDirectory, "notice");
      outcome = await executeChild(executable, directory, invocation, cwd, childEnvironment(plan, invocation, notice), 300000,
        (stream, bytes) => notify("check/output", { contextId, invocationId: id, stream, dataBase64: bytes.toString("base64") }), control,
        async failure => {
          const observed = { ...failure, ...(notice === undefined ? {} : await readChildNotice(notice, failure.exitCode)) };
          await notify("check/outcome", { contextId, invocationId: id, outcome: observed });
          reported = observed;
        });
      if (reported !== undefined) outcome = reported;
      else if (outcome.status === "completed" && notice !== undefined) {
        outcome = { ...outcome, ...await readChildNotice(notice, outcome.exitCode) };
      }
    } catch (error) {
      if (control.active !== undefined || reported !== undefined || error instanceof IncompleteExecutionError) throw error;
      outcome = { status: "unavailable", reason: error.message, remedy: "Repair the captured inputs or local execution environment and retry explicitly." };
    } finally { if (noticeDirectory !== undefined && control.active === undefined) await rm(noticeDirectory, { recursive: true, force: true }).catch(() => undefined); }
    if (reported === undefined) await notify("check/outcome", { contextId, invocationId: id, outcome });
    await reply(request, { contextId, settled: true, outputComplete: true, invocationIds: [id] });
  };
  for await (const line of lines) {
    try {
      const request = JSON.parse(line);
      if (request.method === "check/cancel") {
        if (request.params.planId !== plan?.planId || (request.params.contextId !== undefined && request.params.contextId !== contextId)) throw new Error("Wrong cancellation coordinates");
        stop(); await reply(request, { planId: plan.planId, accepted: true });
      } else if (request.method === "check/release") {
        if (busy !== undefined || request.params.contextId !== contextId) throw new Error("Context cannot be released while work is active");
        let cleanupWarning;
        try { await rm(directory, { recursive: true, force: true }); directory = undefined; }
        catch { cleanupWarning = `Remove settled local adapter resources manually: ${JSON.stringify(directory)}`; }
        await reply(request, { contextId, released: true, ...(cleanupWarning === undefined ? {} : { cleanupWarning }) });
        contextId = undefined;
      } else {
        if (busy !== undefined) throw new Error("Only one work request may be outstanding");
        const operation = request.method === "check/prepare" && plan === undefined ? prepare
          : request.method === "check/run" && contextId !== undefined ? run : undefined;
        if (operation === undefined) throw new Error("Unsupported operation or conversation state");
        busy = operation(request).catch(fail).finally(() => { busy = undefined; });
      }
    } catch { fail(); break; }
  }
  if (busy !== undefined) await busy;
  if (ended && control.active !== undefined) throw new Error("Local execution remains unsettled");
  process.exitCode = failed ? 1 : 0;
}
