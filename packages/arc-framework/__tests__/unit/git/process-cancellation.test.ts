/** Descendant termination when the platform's process utility fails, over a scripted child and utility. */
import { afterEach, describe, expect, it, vi } from "vitest";

const utilities = vi.hoisted(() => ({ calls: [] as string[], failures: new Map<string, number>(), table: "", proc: true,
  delayed: false, pending: [] as (() => void)[] }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  execFile: vi.fn((command: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => {
    utilities.calls.push(command);
    const remaining = utilities.failures.get(command) ?? 0;
    utilities.failures.set(command, Math.max(0, remaining - 1));
    const finish = () => remaining > 0 ? callback(new Error(`${command} failed`), "") : callback(null, command === "ps" ? utilities.table : "SUCCESS");
    if (utilities.delayed) utilities.pending.push(finish); else setImmediate(finish);
    return { kill: () => true, unref: () => undefined, stdin: { end: () => undefined, destroy: () => undefined },
      stdout: { destroy: () => undefined }, stderr: { destroy: () => undefined } };
  }),
}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn((...args: Parameters<typeof actual.readdir>) => utilities.proc ? actual.readdir(...args) : Promise.reject(new Error("no /proc"))) };
});
const { runCancelableGitProcess } = await import("../../../src/lib/git/process-cancellation.js");

const platform = Object.getOwnPropertyDescriptor(process, "platform");
const gitPid = 2_000_000_001, descendant = 2_000_000_002;

afterEach(() => {
  if (platform) Object.defineProperty(process, "platform", platform);
  utilities.calls.length = 0;
  utilities.failures.clear();
  utilities.proc = true;
  utilities.delayed = false; utilities.pending.length = 0;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A Git process that runs until its direct child is killed. */
function runningGit(): Promise<never> & { pid: number; kill: (signal?: NodeJS.Signals | number) => boolean; exitCode: null; signalCode: null } {
  let fail!: (error: unknown) => void;
  const settled = new Promise<never>((_resolve, reject) => { fail = reject; });
  return Object.assign(settled, { pid: gitPid, exitCode: null, signalCode: null,
    kill: () => { fail(Object.assign(new Error("killed"), { signal: "SIGKILL" })); return true; } });
}

async function cancel(): Promise<unknown> {
  const controller = new AbortController();
  const run = runCancelableGitProcess(() => runningGit(), controller.signal, { command: "git", args: ["fetch"] });
  controller.abort();
  return run.catch((error: unknown) => error);
}

describe("Git descendant cancellation when the process utility fails", () => {
  it.each(["darwin", "win32", "linux"])("settles withheld utility callbacks on %s and ignores their late process table", async os => {
    Object.defineProperty(process, "platform", { value: os });
    vi.useFakeTimers();
    utilities.delayed = true; utilities.proc = false;
    utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n`;
    const alive = new Set([descendant]);
    vi.spyOn(process, "kill").mockImplementation(pid => { alive.delete(pid); return true; });
    const controller = new AbortController();
    const pending = runCancelableGitProcess(() => runningGit(), controller.signal, { command: "git", args: ["fetch"] })
      .catch((error: unknown) => error);
    const observed = Promise.race([pending, new Promise(resolve => setTimeout(() => resolve({ kind: "still-running" }), 1_100))]);
    try {
      controller.abort();
      await vi.advanceTimersByTimeAsync(1_100);
      expect(await observed).toMatchObject({ kind: "canceled", isCanceled: true, descendantsUnconfirmed: true });
      expect([...alive]).toEqual([descendant]);
      for (const finish of utilities.pending.splice(0)) finish();
      await vi.advanceTimersByTimeAsync(0);
      expect([...alive]).toEqual([descendant]);
    } finally {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        for (const finish of utilities.pending.splice(0)) finish();
        await vi.advanceTimersByTimeAsync(1_100);
      }
      await pending;
    }
  });

  it("confirms descendants that exited after the process snapshot", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n`;
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("already exited"), { code: "ESRCH" }); });
    expect(await cancel()).toMatchObject({ kind: "canceled", descendantsUnconfirmed: false });
  });

  it("keeps a failed descendant signal unconfirmed while terminating the remaining descendants", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const other = descendant + 1;
    utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n${other} ${gitPid}\n`;
    const alive = new Set([descendant, other]);
    vi.spyOn(process, "kill").mockImplementation(pid => {
      if (pid === other) throw Object.assign(new Error("signal refused"), { code: "EPERM" });
      alive.delete(pid);
      return true;
    });
    expect(await cancel()).toMatchObject({ kind: "canceled", descendantsUnconfirmed: true,
      message: expect.stringContaining("descendant") });
    expect([...alive]).toEqual([other]);
  });

  /** A child the test settles by hand, recording Node's exit state first as a real child's exit does. */
  function settlingGit() {
    let resolve!: (value: { stdout: string | Buffer; stderr: string | Buffer }) => void, reject!: (error: unknown) => void;
    const child = Object.assign(new Promise<{ stdout: string | Buffer; stderr: string | Buffer }>((yes, no) => { resolve = yes; reject = no; }),
      { pid: gitPid, kill: () => true, exitCode: null as number | null, signalCode: null as NodeJS.Signals | null });
    return { child,
      succeed: (output: { stdout: string | Buffer; stderr: string | Buffer }) => { child.exitCode = 0; resolve(output); },
      fail: (error: Error) => { child.exitCode = 128; reject(error); } };
  }

  async function drainDelayedUtilities(): Promise<void> {
    for (let i = 0; i < 3; i += 1) { utilities.pending.shift()?.(); await new Promise<void>(done => setImmediate(done)); }
  }

  it.each((["success", "failure"] as const).flatMap(outcome => [false, true].flatMap(failedScan =>
    [false, true].map(bytes => ({ outcome, failedScan, bytes })))))(
    "finishes accepted cancellation after independent $outcome while a delayed scan fails: $failedScan, bytes: $bytes", async ({ outcome, failedScan, bytes }) => {
      Object.defineProperty(process, "platform", { value: "darwin" });
      utilities.delayed = true; utilities.failures.set("ps", failedScan ? 2 : 0);
      utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n`;
      const alive = new Set([descendant]);
      vi.spyOn(process, "kill").mockImplementation(pid => { alive.delete(pid); return true; });
      const git = settlingGit();
      const controller = new AbortController();
      let settled = false;
      const pending = runCancelableGitProcess(() => git.child, controller.signal, { command: "git", args: ["fetch"] })
        .catch((error: unknown) => { settled = true; return error; });
      controller.abort();
      const output = bytes ? { stdout: Buffer.from([65, 0, 128, 255]), stderr: Buffer.from([66, 255, 128]) }
        : { stdout: "Completed text output", stderr: "Completed text diagnostic" };
      if (outcome === "success") git.succeed(output); else git.fail(Object.assign(new Error("Independent failure"), output, { exitCode: 128 }));
      await new Promise<void>(done => setImmediate(done));
      expect.soft(settled).toBe(false);
      await drainDelayedUtilities();
      // The child exited before the scan returned, so its PID may name another process and its descendants stay unconfirmed.
      expect(await pending).toMatchObject({ kind: "canceled", descendantsUnconfirmed: true,
        stdout: typeof output.stdout === "string" ? output.stdout : output.stdout.toString("latin1"),
        stderr: typeof output.stderr === "string" ? output.stderr : output.stderr.toString("latin1") });
      expect([...alive]).toEqual([descendant]);
    });

  it("confirms descendants it ends while the child keeps running through a delayed scan", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    utilities.delayed = true;
    utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n`;
    const alive = new Set([descendant]);
    vi.spyOn(process, "kill").mockImplementation(pid => { alive.delete(pid); return true; });
    const git = settlingGit();
    const controller = new AbortController();
    const pending = runCancelableGitProcess(() => git.child, controller.signal, { command: "git", args: ["fetch"] }).catch((error: unknown) => error);
    controller.abort();
    await drainDelayedUtilities();
    expect([...alive]).toEqual([]);
    git.fail(Object.assign(new Error("killed"), { signal: "SIGKILL" }));
    expect(await pending).toMatchObject({ kind: "canceled", descendantsUnconfirmed: false });
  });

  it("reports uncertain ownership when the process table no longer contains the parent", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    utilities.table = "";
    await expect(cancel()).resolves.toMatchObject({ kind: "canceled", descendantsUnconfirmed: true });
  });

  it.each([
    { name: "a failing ps off Linux", os: "darwin", utility: "ps", proc: true },
    { name: "a failing taskkill on Windows", os: "win32", utility: "taskkill", proc: true },
    { name: "a failing ps on Linux with no readable process table", os: "linux", utility: "ps", proc: false },
  ])("retries once, then reports $name as an unconfirmed descendant kill", async ({ os, utility, proc }) => {
    Object.defineProperty(process, "platform", { value: os });
    utilities.failures.set(utility, 2);
    utilities.proc = proc;
    const kills = vi.spyOn(process, "kill").mockImplementation(() => true);
    const error = await cancel();
    expect(error).toMatchObject({ name: "GitProcessError", kind: "canceled", isCanceled: true, descendantsUnconfirmed: true,
      message: expect.stringContaining("descendant") });
    expect(utilities.calls.filter((command) => command === utility)).toHaveLength(2);
    expect(kills).not.toHaveBeenCalled();
  });

  it("ends the descendants a retried ps finds and reports them confirmed", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    utilities.failures.set("ps", 1);
    utilities.table = `${gitPid} 1\n${descendant} ${gitPid}\n`;
    const kills = vi.spyOn(process, "kill").mockImplementation(() => true);
    const error = await cancel();
    expect(error).toMatchObject({ kind: "canceled", descendantsUnconfirmed: false });
    expect(utilities.calls.filter((command) => command === "ps")).toHaveLength(2);
    expect(kills).toHaveBeenCalledWith(descendant, "SIGKILL");
  });
});
