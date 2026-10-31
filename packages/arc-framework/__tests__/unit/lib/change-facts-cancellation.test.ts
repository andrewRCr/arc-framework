/** Native raw Git cancellation retains captured output and descendant uncertainty. */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("node:child_process", async original => ({
  ...await original<typeof import("node:child_process")>(),
  spawn: boundary.spawn,
  execFile: boundary.execFile,
}));

import { createSpawnRawGitExec } from "../../../src/lib/change-facts.js";
import { withExitState } from "../../helpers/child-exit-state.js";

const platform = Object.getOwnPropertyDescriptor(process, "platform");
afterEach(() => {
  if (platform) Object.defineProperty(process, "platform", platform);
  vi.resetAllMocks();
});

it("reports an unconfirmed descendant tree with the captured native raw output", async () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  const child = withExitState(Object.assign(new EventEmitter(), {
    pid: 2_000_000_001, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => { child.emit("close", null); return true; },
  }));
  let spawned!: () => void;
  const ready = new Promise<void>(resolve => { spawned = resolve; });
  boundary.spawn.mockImplementation(() => { queueMicrotask(spawned); return child; });
  boundary.execFile.mockImplementation((_command, _args, _options, callback) => {
    setImmediate(() => callback(new Error("Process utility unavailable"), ""));
    return { stdin: { end: () => undefined } };
  });
  const controller = new AbortController();
  const pending = createSpawnRawGitExec()(["fetch"], { signal: controller.signal }).catch((error: unknown) => error);
  await ready;
  const stdout = Buffer.concat([Buffer.from("captured output"), Buffer.from([0, 128, 255, 226, 130])]);
  const stderr = Buffer.concat([Buffer.from("captured diagnostic"), Buffer.from([1, 255, 128, 240, 159])]);
  child.stdout.write(stdout);
  child.stderr.write(stderr);
  controller.abort();
  await expect(pending).resolves.toMatchObject({ kind: "canceled", isCanceled: true,
    stdout: stdout.toString("latin1"), stderr: stderr.toString("latin1"), descendantsUnconfirmed: true,
    message: expect.stringContaining("descendant") });
});

it.each([0, 128])("joins accepted native cancellation when the direct child closes independently with %s", async code => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  const callbacks: (() => void)[] = [];
  boundary.execFile.mockImplementation((_command, _args, _options, callback) => {
    callbacks.push(() => callback(new Error("Process utility unavailable"), ""));
    return { stdin: { end: () => undefined } };
  });
  const child = withExitState(Object.assign(new EventEmitter(), { pid: 2_000_000_001,
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true }));
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  boundary.spawn.mockImplementation(() => { queueMicrotask(ready); return child; });
  const controller = new AbortController();
  let settled = false;
  const pending = createSpawnRawGitExec()(["fetch"], { signal: controller.signal })
    .catch((error: unknown) => { settled = true; return error; });
  await started;
  child.stdout.write(Buffer.from([65, 0, 128, 255])); child.stderr.write("Native diagnostic");
  controller.abort(); child.emit("close", code);
  await new Promise<void>(done => setImmediate(done));
  expect.soft(settled).toBe(false);
  for (let i = 0; i < 3; i += 1) { callbacks.shift()?.(); await new Promise<void>(done => setImmediate(done)); }
  expect(await pending).toMatchObject({ kind: "canceled", descendantsUnconfirmed: true,
    stdout: Buffer.from([65, 0, 128, 255]).toString("latin1"), stderr: "Native diagnostic" });
});

it("owns a pending stdin error while native cancellation is joining its child", async () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  const child = withExitState(Object.assign(new EventEmitter(), {
    pid: 2_000_000_001, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => { child.emit("close", null); return true; },
  }));
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  boundary.spawn.mockImplementation(() => { queueMicrotask(ready); return child; });
  boundary.execFile.mockImplementation((_command, _args, _options, callback) => {
    setImmediate(() => callback(new Error("Process utility unavailable"), ""));
    return { stdin: { end: () => undefined } };
  });
  const controller = new AbortController();
  const pending = createSpawnRawGitExec()(["hash-object", "--stdin"], {
    input: Buffer.alloc(1024 * 1024, 65), signal: controller.signal,
  }).catch((error: unknown) => error);
  await started;
  child.stdout.write(Buffer.from([65, 0, 128, 255])); child.stderr.write("Before input closed");
  try {
    controller.abort();
    child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    expect(await pending).toMatchObject({ kind: "canceled", isCanceled: true,
      stdout: Buffer.from([65, 0, 128, 255]).toString("latin1"), stderr: "Before input closed" });
  } finally { child.emit("close", null); await pending; }
});

it.each([0, 128])("settles stdin failure with captured output when native Git exits %s", async code => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => true,
  });
  boundary.spawn.mockReturnValue(child);
  const pending = createSpawnRawGitExec()(["hash-object", "--stdin"], { input: Buffer.from("input") })
    .catch((error: unknown) => error);
  child.stdout.write(Buffer.from([65, 0, 128, 255])); child.stderr.write("Original Git diagnostic");
  try {
    child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
    child.emit("close", code);
    expect(await pending).toMatchObject({ ...(code === 0 ? { code: "EPIPE" } : { exitCode: code }),
      stdout: Buffer.from([65, 0, 128, 255]), stderr: Buffer.from("Original Git diagnostic") });
  } finally { child.emit("close", code); await pending; }
});
