/** Linux process-group supervision and plan-ID inspection, independent of ARC code. */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { constants } from "node:os";

export class IncompleteExecutionError extends Error {}

async function processState(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = text.slice(text.lastIndexOf(")") + 2).split(" ");
    return { state: fields[0], group: Number(fields[2]), birth: fields[19] };
  } catch (error) { if (error.code === "ENOENT" || error.code === "ESRCH") return undefined; throw error; }
}

export async function groupMembers(group, omit) {
  const members = await Promise.all((await readdir("/proc")).filter(name => /^\d+$/u.test(name)).map(async name => {
    const pid = Number(name);
    if (pid === omit) return undefined;
    const state = await processState(pid);
    return state?.group === group && state.state !== "Z" && state.state !== "X" ? pid : undefined;
  }));
  return members.filter(pid => pid !== undefined);
}

export async function ownerRecord(readProcess = processState) {
  const state = await readProcess(process.pid);
  if (state?.birth === undefined) throw new Error("Linux process identity is unavailable; provide readable /proc and retry");
  return { pid: process.pid, birth: state.birth };
}
export async function ownerAlive(record, readProcess = processState) {
  const state = await readProcess(record.pid);
  return record.birth !== undefined && state?.birth === record.birth && state.state !== "Z" && state.state !== "X";
}

function timeoutOutcome(timeout) {
  return { status: "unavailable", reason: `Command exceeded this example's ${timeout / 1000}-second limit and was stopped`,
    remedy: "Shorten the command, or run it under a provider with a longer limit, and retry." };
}

export function signalGroup(pid, signal = "SIGTERM") {
  try { process.kill(-pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}

/** Worker starts commands only after its ownership record and parent handshake. */
export async function runWorker(directory, token) {
  let stopped = false;
  let timedOut = false;
  let started = false;
  let finished = false;
  const recordPath = join(directory, `${token}.json`);
  const record = await ownerRecord();
  let forced;
  const stop = (signalled = false) => {
    if (stopped) return;
    stopped = true;
    if (!signalled) signalGroup(process.pid);
    forced = setTimeout(() => { signalGroup(process.pid, "SIGKILL"); }, 1000);
  };
  process.on("SIGTERM", () => { stop(true); });
  process.on("disconnect", () => { if (!finished && started) stop(); else process.exitCode = 0; });
  await writeFile(recordPath, JSON.stringify({ ...record, done: false }), { flag: "wx", mode: 0o600 });
  process.send?.({ ready: true });
  process.once("message", async request => {
    if (stopped || !process.connected) return;
    started = true;
    const timer = setTimeout(() => { timedOut = !stopped; stop(); }, request.timeout);
    let launchError = false;
    const child = spawn(request.invocation.argv[0], request.invocation.argv.slice(1), {
      cwd: request.cwd, env: request.environment, shell: request.invocation.shell, stdio: ["ignore", 1, 2],
    });
    child.on("error", () => { launchError = true; });
    const status = await new Promise(resolve => { child.once("close", (code, signal) => { resolve({ code, signal }); }); });
    const native = { status: "completed", exitCode: status.code ?? 128 + (constants.signals[status.signal] ?? 0) };
    // A known native failure stays irrevocable while remaining descendants drain.
    const failure = !stopped && !launchError && native.exitCode !== 0 ? native : undefined;
    if (failure !== undefined && process.connected) await new Promise(resolve => { process.send({ nativeFailure: failure }, resolve); });
    while ((await groupMembers(process.pid, process.pid)).length !== 0) await delay(10);
    clearTimeout(timer); clearTimeout(forced);
    await writeFile(recordPath, JSON.stringify({ ...record, done: true }), { mode: 0o600 });
    const outcome = failure ?? (timedOut ? timeoutOutcome(request.timeout)
      : stopped ? { status: "cancelled", reason: "Local process group cancellation settled" }
      : launchError ? { status: "unavailable", reason: "Child executable could not start", remedy: "Repair the command or prepared environment and retry." }
      : native);
    if (process.connected) await new Promise(resolve => { process.send(outcome, resolve); });
    finished = true;
    if (process.connected) process.disconnect();
  });
}

export async function executeChild(executable, directory, invocation, cwd, environment, timeout, output, control, observeFailure = async () => {}) {
  const token = randomUUID();
  const worker = spawn(process.execPath, [executable, "--worker", directory, token], {
    detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let outcome;
  let started = false;
  let launchError;
  let failure;
  let timedOut = false;
  let deadline;
  let observationError;
  let observations = Promise.resolve();
  worker.on("error", error => { launchError = error; });
  const closed = new Promise(resolve => { worker.once("close", (code, signal) => { resolve({ code, signal }); }); });
  const active = { pid: worker.pid, stop: () => {
    if (worker.pid !== undefined) signalGroup(worker.pid);
  } };
  control.active = active;
  worker.on("message", message => {
    if (message.ready) {
      if (control.cancelled) active.stop();
      else {
        started = true;
        // A command that ignores SIGTERM takes the worker down with its group, so the limit is also tracked here.
        deadline = setTimeout(() => { timedOut = true; }, timeout);
        worker.send({ invocation, cwd, environment, timeout });
      }
    } else if (message.nativeFailure !== undefined) {
      failure = message.nativeFailure;
      observations = observations.then(() => observeFailure(failure)).catch(error => { observationError = error; active.stop(); });
    } else outcome = message;
  });
  const pumps = ["stdout", "stderr"].map(async stream => {
    for await (const bytes of worker[stream]) {
      for (let offset = 0; offset < bytes.length; offset += 65536) await output(stream, bytes.subarray(offset, offset + 65536));
    }
  });
  const collection = Promise.all(pumps).then(() => ({ ok: true }), error => { active.stop(); return { ok: false, error }; });
  const status = await closed;
  clearTimeout(deadline);
  const collected = await collection;
  await observations;
  if (worker.pid !== undefined) while ((await groupMembers(worker.pid)).length !== 0) await delay(10);
  if (control.active === active) control.active = undefined;
  if (!collected.ok || observationError !== undefined) throw new IncompleteExecutionError("Required execution output or terminal reporting could not be collected");
  if (control.cancelled && started) return failure ?? { status: "cancelled", reason: "Local process group cancellation settled" };
  if (timedOut && outcome === undefined && failure === undefined) return timeoutOutcome(timeout);
  if (launchError !== undefined || !started || status.code !== 0 || outcome === undefined) throw new Error("Local supervisor did not complete its execution record");
  return failure ?? outcome;
}

export async function inspectAttempt(directory, settle = false) {
  await ownerRecord();
  let owner;
  try { owner = JSON.parse(await readFile(join(directory, "owner.json"), "utf8")); }
  catch (error) {
    // Recovery is announced before the owner record exists, and no work starts without one.
    if (error.code === "ENOENT") return { planId: basename(directory), status: "settled", workers: [] };
    throw error;
  }
  if (settle && await ownerAlive(owner)) process.kill(owner.pid, "SIGTERM");
  const files = (await readdir(directory)).filter(name => name !== "owner.json" && name.endsWith(".json"));
  const workers = [];
  for (const file of files) {
    const record = JSON.parse(await readFile(join(directory, file), "utf8"));
    const leader = await processState(record.pid);
    // A drained group, or a leader PID now held by a later process, can only match an unrelated reused group.
    const reused = record.done === true || (leader !== undefined && leader.birth !== record.birth);
    let members = reused ? [] : await groupMembers(record.pid);
    // A group ID cannot be reused while members remain, even after its worker has exited.
    if (settle && members.length !== 0) {
      signalGroup(record.pid); await delay(1100);
      if ((await groupMembers(record.pid)).length !== 0) { signalGroup(record.pid, "SIGKILL"); await delay(100); }
      members = await groupMembers(record.pid);
    }
    workers.push({ pid: record.pid, members });
  }
  return { planId: owner.planId, status: await ownerAlive(owner) || workers.some(worker => worker.members.length) ? "active" : "settled", workers };
}
