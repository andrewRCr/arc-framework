/** Failure-path coverage for the real wrapped Git subprocess adapter. */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSpawnGit } from "../../../../src/handlers/release/commit-cli.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createSpawnGit", () => {
  it("terminates and rejects when captured output streams are unavailable", async () => {
    vi.stubEnv("GIT_DIR", "/poisoned/repository");
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");
    const events = new EventEmitter();
    const proc = Object.assign(events, {
      stdin: null,
      stdout: null,
      stderr: new PassThrough(),
      killed: false,
      kill() {
        this.killed = true;
        return true;
      },
    });
    const spawnMock = vi.fn(() => proc);
    const spawnProcess = spawnMock as unknown as typeof spawn;

    await expect(createSpawnGit(spawnProcess)({
      args: ["-m", "message"],
      cwd: process.cwd(),
    })).rejects.toThrow("git commit did not expose captured output streams");
    expect(proc.killed).toBe(true);
    const calls = spawnMock.mock.calls as unknown as Array<[
      string,
      string[],
      { env?: NodeJS.ProcessEnv },
    ]>;
    const options = calls[0]?.[2];
    expect(options?.env).toMatchObject({ ARC_TEST_SENTINEL: "preserved" });
    expect(options?.env).not.toHaveProperty("GIT_DIR");
  });

  it("returns Git's exit status when Git closes before consuming piped stdin", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await createSpawnGit(spawn)({
      args: ["--arc-invalid-option", "-F", "-"],
      cwd: process.cwd(),
      stdin: Buffer.alloc(16 * 1024 * 1024, "x"),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("arc-invalid-option");
  });

  it("terminates Git and rejects after a fatal stdin write error", async () => {
    const stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("stdin write failed"), { code: "EIO" }));
      },
    });
    const events = new EventEmitter();
    const proc = Object.assign(events, {
      stdin,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      killed: false,
      kill() {
        this.killed = true;
        queueMicrotask(() => events.emit("close", null));
        return true;
      },
    });
    const spawnProcess = vi.fn(() => proc) as unknown as typeof spawn;

    await expect(createSpawnGit(spawnProcess)({
      args: ["-F", "-"],
      cwd: process.cwd(),
      stdin: Buffer.from("message"),
    })).rejects.toThrow("stdin write failed");
    expect(proc.killed).toBe(true);
  });
});
