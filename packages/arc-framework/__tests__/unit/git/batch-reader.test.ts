/** Native batch reader failure ordering over a scripted child process. */
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(() => child.current),
  // The platform's process utility always fails, so a canceled read cannot confirm its descendants ended.
  execFile: vi.fn((_command: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string) => void) => {
    setImmediate(() => callback(new Error("utility failed"), ""));
    return { stdin: { end: () => undefined } };
  }),
}));
const { GitBatchReadScope } = await import("../../../src/lib/git/batch-reader.js");

/** A Git process that refuses its repository: the first write meets a closed pipe before Git's exit is observed. */
function exitedBeforeReading(): EventEmitter {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true,
    stdin: new Writable({ write(_chunk, _encoding, done) {
      done(Object.assign(new Error("write EPIPE"), { code: "EPIPE", errno: -32, syscall: "write" }));
      setTimeout(() => {
        process.stderr.end("fatal: not a git repository: 'missing-store'\n");
        process.stdout.end();
        setTimeout(() => process.emit("close", 128, null), 5);
      }, 5);
    } }),
  });
  return process;
}

/** A Git process that waits on its input, aborting the read once the request reaches it, until it is killed. */
function waitingForOutput(abort: () => void): EventEmitter {
  const process = Object.assign(new EventEmitter(), {
    pid: 2_000_000_003, stdout: new PassThrough(), stderr: new PassThrough(),
    stdin: new Writable({ write(_chunk, _encoding, done) { done(); abort(); } }),
    kill: () => {
      setImmediate(() => { process.stdout.end(); process.stderr.end(); process.emit("close", null, "SIGKILL"); });
      return true;
    },
  });
  return process;
}

describe("native Git batch reader failures", () => {
  it("releases inherited stderr before awaiting the canceled child's close", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin" });
    const controller = new AbortController();
    const readerChild = Object.assign(new EventEmitter(), {
      pid: 2_000_000_004, stdout: new PassThrough(), stderr: new PassThrough(),
      stdin: new Writable({ write(_chunk, _encoding, done) { done(); controller.abort(); } }),
      kill: () => { readerChild.stdout.end(); return true; },
    });
    let closed = false;
    const close = () => {
      if (!closed && readerChild.stdout.destroyed && readerChild.stderr.destroyed) { closed = true; readerChild.emit("close", null, "SIGKILL"); }
    };
    readerChild.stdout.on("close", close); readerChild.stderr.on("close", close);
    child.current = readerChild;
    const scope = new GitBatchReadScope();
    const pending = scope.run({ args: ["cat-file", "--batch"], cwd: "/repository", env: {}, maxBuffer: 1024,
      input: Buffer.from("HEAD\n"), signal: controller.signal }).catch((error: unknown) => error);
    try {
      const outcome = await Promise.race([pending, new Promise<"still-open">(resolve => setTimeout(() => resolve("still-open"), 100))]);
      expect(outcome).toMatchObject({ kind: "canceled", descendantsUnconfirmed: true });
      expect(readerChild.stderr.destroyed).toBe(true);
    } finally {
      readerChild.stdout.destroy(); readerChild.stderr.destroy();
      await pending; await scope.close();
      if (platform) Object.defineProperty(globalThis.process, "platform", platform);
    }
  });

  it("reports a canceled read whose descendants the process utility could not confirm ended", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin" });
    const controller = new AbortController();
    child.current = waitingForOutput(() => controller.abort());
    const scope = new GitBatchReadScope();
    try {
      await expect(scope.run({ args: ["cat-file", "--batch"], cwd: "/repository", env: {}, maxBuffer: 1024, input: Buffer.from("HEAD\n"),
        signal: controller.signal })).rejects.toMatchObject({ kind: "canceled", isCanceled: true, descendantsUnconfirmed: true });
    } finally {
      if (platform) Object.defineProperty(process, "platform", platform);
      await scope.close();
    }
  });

  it("reports Git's exit status and stderr when a write meets the pipe Git closed on exit", async () => {
    child.current = exitedBeforeReading();
    const scope = new GitBatchReadScope();
    try {
      await expect(scope.run({ args: ["--git-dir=missing-store", "cat-file", "--batch"], cwd: "/repository", env: {},
        maxBuffer: 1024, input: Buffer.from("HEAD\n") }))
        .rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 128, stderr: expect.stringContaining("not a git repository") });
    } finally { await scope.close(); }
  });
});
