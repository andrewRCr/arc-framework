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

const platform = Object.getOwnPropertyDescriptor(process, "platform");
afterEach(() => {
  if (platform) Object.defineProperty(process, "platform", platform);
  vi.resetAllMocks();
});

it("reports an unconfirmed descendant tree with the captured native raw output", async () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  const child = Object.assign(new EventEmitter(), {
    pid: 2_000_000_001, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: () => { child.emit("close", null); return true; },
  });
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
  child.stdout.write("captured output");
  child.stderr.write("captured diagnostic");
  controller.abort();
  await expect(pending).resolves.toMatchObject({ kind: "canceled", isCanceled: true,
    stdout: "captured output", stderr: "captured diagnostic", descendantsUnconfirmed: true,
    message: expect.stringContaining("descendant") });
});
