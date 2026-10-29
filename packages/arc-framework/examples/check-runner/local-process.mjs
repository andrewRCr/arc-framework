/** Linux process-group supervision and plan-ID inspection, independent of ARC code. */
import { spawn } from "node:child_process";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { constants } from "node:os";

/**
 * @typedef {import("./local-types.mjs").Outcome} Outcome
 * @typedef {import("./local-types.mjs").Completed} Completed
 * @typedef {import("./local-types.mjs").WorkerRequest} WorkerRequest
 * @typedef {import("./local-types.mjs").WorkerMessage} WorkerMessage
 * @typedef {import("./local-types.mjs").CloseStatus} CloseStatus
 * @typedef {import("./local-types.mjs").OwnerRecord} OwnerRecord
 */
export class IncompleteExecutionError extends Error {}

/**
 * @param {number} pid
 * @returns {Promise<import("./local-types.mjs").ProcessState | undefined>}
 */
async function processState(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = text.slice(text.lastIndexOf(")") + 2).split(" ");
    return { state: fields[0], group: Number(fields[2]), birth: fields[19] };
  } catch (error) { if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ESRCH")) return undefined; throw error; }
}

/**
 * @param {number} group
 * @param {number} [omit]
 * @returns {Promise<number[]>}
 */
export async function groupMembers(group, omit) {
  const members = await Promise.all((await readdir("/proc")).filter(name => /^\d+$/u.test(name)).map(async name => {
    const pid = Number(name);
    if (pid === omit) return undefined;
    const state = await processState(pid);
    return state !== undefined && state.group === group && state.state !== "Z" && state.state !== "X" ? pid : undefined;
  }));
  return members.filter(pid => pid !== undefined);
}

/**
 * @param {import("./local-types.mjs").ReadProcess} [readProcess]
 * @returns {Promise<OwnerRecord>}
 */
export async function ownerRecord(readProcess = processState) {
  const state = await readProcess(process.pid);
  if (state?.birth === undefined) throw new Error("Linux process identity is unavailable; provide readable /proc and retry");
  return { pid: process.pid, birth: state.birth };
}
/**
 * @param {{pid: number, birth?: string}} record
 * @param {import("./local-types.mjs").ReadProcess} [readProcess]
 */
export async function ownerAlive(record, readProcess = processState) {
  const state = await readProcess(record.pid);
  return record.birth !== undefined && state !== undefined && state.birth === record.birth && state.state !== "Z" && state.state !== "X";
}

/**
 * @param {number} timeout
 * @returns {import("./local-types.mjs").Unavailable}
 */
function timeoutOutcome(timeout) {
  return { status: "unavailable", reason: `Command exceeded this example's ${timeout / 1000}-second limit and was stopped`,
    remedy: "Shorten the command, or run it under a provider with a longer limit, and retry." };
}

/**
 * @param {number} pid
 * @param {NodeJS.Signals} [signal]
 */
export function signalGroup(pid, signal = "SIGTERM") {
  try { process.kill(-pid, signal); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error; }
}

/**
 * Wait for the IPC write callback while continuing to drain owned descendants.
 * The parent detects missing terminal delivery from its incomplete conversation.
 * @param {WorkerMessage} message
 * @returns {Promise<void>}
 */
function reportWorkerMessage(message) {
  const send = process.send?.bind(process);
  if (send === undefined) return Promise.reject(new Error("Worker IPC is unavailable"));
  return new Promise(resolve => { send(message, () => { resolve(); }); });
}

/**
 * Worker starts commands only after its ownership record and parent handshake.
 * @param {string} directory
 * @param {string} token
 */
export async function runWorker(directory, token) {
  /** @type {{stopped: boolean, timedOut: boolean, started: boolean, finished: boolean, launchError: boolean, forced: ReturnType<typeof setTimeout> | undefined}} */
  const state = { stopped: false, timedOut: false, started: false, finished: false, launchError: false, forced: undefined };
  // Callbacks can change these values while execution awaits process and IPC completion.
  const readState = () => state;
  const connected = () => process.connected;
  /** @type {Partial<Record<NodeJS.Signals, number>>} */
  const signals = constants.signals;
  const recordPath = join(directory, `${token}.json`);
  const record = await ownerRecord();
  const stop = (signalled = false) => {
    if (state.stopped) return;
    state.stopped = true;
    if (!signalled) signalGroup(process.pid);
    state.forced = setTimeout(() => { signalGroup(process.pid, "SIGKILL"); }, 1000);
  };
  process.on("SIGTERM", () => { stop(true); });
  process.on("disconnect", () => { if (!state.finished && state.started) stop(); else process.exitCode = 0; });
  await writeFile(recordPath, JSON.stringify({ ...record, done: false }), { flag: "wx", mode: 0o600 });
  process.send?.({ ready: true });
  /** @param {WorkerRequest} request */
  const execute = async request => {
    if (state.stopped || !connected()) return;
    state.started = true;
    const timer = setTimeout(() => { state.timedOut = !state.stopped; stop(); }, request.timeout);
    const child = spawn(request.invocation.argv[0], request.invocation.argv.slice(1), {
      cwd: request.cwd, env: request.environment, shell: request.invocation.shell, stdio: ["ignore", 1, 2],
    });
    child.on("error", () => { state.launchError = true; });
    /** @type {Promise<CloseStatus>} */
    const closing = new Promise(resolve => { child.once("close", (code, signal) => { resolve({ code, signal }); }); });
    const status = await closing;
    /** @type {Completed} */
    const native = { status: "completed", exitCode: status.code ?? 128 + (status.signal === null ? 0 : signals[status.signal] ?? 0) };
    // A known native failure stays irrevocable while remaining descendants drain.
    const failure = !readState().stopped && !readState().launchError && native.exitCode !== 0 ? native : undefined;
    if (failure !== undefined && connected()) await reportWorkerMessage({ nativeFailure: failure });
    while ((await groupMembers(process.pid, process.pid)).length !== 0) await delay(10);
    clearTimeout(timer); clearTimeout(state.forced);
    await writeFile(recordPath, JSON.stringify({ ...record, done: true }), { mode: 0o600 });
    const outcome = failure ?? (readState().timedOut ? timeoutOutcome(request.timeout)
      : readState().stopped ? { status: "cancelled", reason: "Local process group cancellation settled" }
      : readState().launchError ? { status: "unavailable", reason: "Child executable could not start", remedy: "Repair the command or prepared environment and retry." }
      : native);
    if (connected()) await reportWorkerMessage(outcome);
    state.finished = true;
    if (connected()) process.disconnect?.();
  };
  // An unhandled execution failure terminates this worker; its parent retains the unsettled attempt.
  process.once("message", message => { void execute(/** @type {WorkerRequest} */ (message)); });
}

/**
 * Run one supervised command and collect complete output and native outcomes.
 * @param {string} executable
 * @param {string} directory
 * @param {import("./local-types.mjs").WorkerRequest["invocation"]} invocation
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} environment
 * @param {number} timeout
 * @param {import("./local-types.mjs").Output} output
 * @param {import("./local-types.mjs").Control} control
 * @param {import("./local-types.mjs").ObserveFailure} [observeFailure]
 * @returns {Promise<Outcome>}
 */
export async function executeChild(executable, directory, invocation, cwd, environment, timeout, output, control, observeFailure = () => Promise.resolve()) {
  const token = randomUUID();
  const worker = spawn(process.execPath, [executable, "--worker", directory, token], {
    detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  /** @type {import("./local-types.mjs").ExecutionState} */
  const state = { started: false, timedOut: false };
  /** @type {Promise<void>} */
  let observations = Promise.resolve();
  worker.on("error", error => { state.launchError = error; });
  /** @type {Promise<CloseStatus>} */
  const closed = new Promise(resolve => { worker.once("close", (code, signal) => { resolve({ code, signal }); }); });
  const active = { pid: worker.pid, stop: () => {
    if (worker.pid !== undefined) signalGroup(worker.pid);
  } };
  control.active = active;
  worker.on("message", value => {
    const message = /** @type {WorkerMessage} */ (value);
    if (message.ready) {
      if (control.cancelled) active.stop();
      else {
        state.started = true;
        // A command that ignores SIGTERM takes the worker down with its group, so the limit is also tracked here.
        state.deadline = setTimeout(() => { state.timedOut = true; }, timeout);
        worker.send({ invocation, cwd, environment, timeout });
      }
    } else if (message.nativeFailure !== undefined) {
      state.failure = message.nativeFailure;
      const failure = message.nativeFailure;
      observations = observations.then(() => observeFailure(failure)).catch(/** @param {unknown} error */ error => { state.observationError = error; active.stop(); });
    } else state.outcome = message;
  });
  /** @type {["stdout" | "stderr", import("node:stream").Readable | null][]} */
  const streams = [["stdout", worker.stdout], ["stderr", worker.stderr]];
  const pumps = streams.map(async ([stream, input]) => {
    if (input === null) throw new Error("Worker output pipe is unavailable");
    for await (const bytes of /** @type {AsyncIterable<import("node:buffer").Buffer>} */ (input)) {
      for (let offset = 0; offset < bytes.length; offset += 65536) await output(stream, bytes.subarray(offset, offset + 65536));
    }
  });
  const collection = Promise.all(pumps).then(() => ({ ok: true }), /**
 * @param {unknown} error */ error => { active.stop(); return { ok: false, error }; });
  const status = await closed;
  clearTimeout(state.deadline);
  const collected = await collection;
  await observations;
  if (worker.pid !== undefined) while ((await groupMembers(worker.pid)).length !== 0) await delay(10);
  if (control.active === active) control.active = undefined;
  if (!collected.ok || state.observationError !== undefined) throw new IncompleteExecutionError("Required execution output or terminal reporting could not be collected");
  if (control.cancelled && state.started) return state.failure ?? { status: "cancelled", reason: "Local process group cancellation settled" };
  if (state.timedOut && state.outcome === undefined) return state.failure ?? timeoutOutcome(timeout);
  if (state.launchError !== undefined || !state.started || status.code !== 0 || state.outcome === undefined) throw new Error("Local supervisor did not complete its execution record");
  return state.failure ?? state.outcome;
}

/**
 * Inspect or settle records belonging to a caller-known attempt.
 * @param {string} directory
 * @param {boolean} [settle]
 */
export async function inspectAttempt(directory, settle = false) {
  await ownerRecord();
  /** @type {OwnerRecord & {planId: string}} */
  let owner;
  try {
    /** @type {unknown} */
    const decoded = JSON.parse(await readFile(join(directory, "owner.json"), "utf8"));
    owner = /** @type {OwnerRecord & {planId: string}} */ (decoded);
  }
  catch (error) {
    // Recovery is announced before the owner record exists, and no work starts without one.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return { planId: basename(directory), status: "settled", workers: [] };
    throw error;
  }
  if (settle && await ownerAlive(owner)) process.kill(owner.pid, "SIGTERM");
  const files = (await readdir(directory)).filter(name => name !== "owner.json" && name.endsWith(".json"));
  const workers = [];
  for (const file of files) {
    /** @type {unknown} */
    const decoded = JSON.parse(await readFile(join(directory, file), "utf8"));
    const record = /** @type {import("./local-types.mjs").WorkerRecord} */ (decoded);
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
