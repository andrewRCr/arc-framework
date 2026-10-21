/** Native batch reader failure ordering over a scripted child process. */
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: vi.fn(() => child.current),
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

describe("native Git batch reader failures", () => {
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
