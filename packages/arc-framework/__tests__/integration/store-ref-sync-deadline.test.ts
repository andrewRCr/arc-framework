import { execFile } from "node:child_process";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const execFileAsync = promisify(execFile);
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "draft.md", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

async function processes(): Promise<{ pid: number; command: string }[]> {
  const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,args="]);
  return stdout.trim().split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
    return match ? [{ pid: Number(match[1]), command: match[2] ?? "" }] : [];
  });
}

async function expectEnded(pids: number[]): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const remaining = (await processes()).filter((row) => pids.includes(row.pid) && !row.command.includes("<defunct>"));
    if (remaining.length === 0) return;
    await delay(5);
  }
  expect((await processes()).filter((row) => pids.includes(row.pid) && !row.command.includes("<defunct>")).map(({ pid }) => pid)).toEqual([]);
}

describe.each(["default", "separate"] as const)("sync deadline in the %s layout", (layout) => {
  it.each(layout === "default" ? ["pull", "push", "push after read source"] as const : ["pull", "push"] as const)("aborts a hung HTTP %s at the deadline, ends its helper, and permits a new push", async (operation) => {
    const mode = operation === "pull" ? "pull" : "push", firstRead = operation === "push after read source";
    const h = await refSyncFixture(layout), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
    let admitted: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admitted = resolve; });
    const sockets = new Set<Socket>();
    const server = createServer(() => admitted?.());
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP endpoint");
    const url = `http://127.0.0.1:${address.port}/repo`;
    if (firstRead) {
      await h.a.exec("git", ["remote", "add", "aaa", url]);
      await h.a.exec("git", ["config", "remote.aaa.arc-state", "read"]);
    } else await h.a.git(["remote", "set-url", ...mode === "push" ? ["--push"] : [], h.remoteName, url]);
    const rescue = new AbortController();
    const store = createRefStore({ ...h.a.ports, ...clock,
      exec: (command, args, options) => h.a.ports.exec(command, args, { ...options, signal: options?.signal ?? rescue.signal }),
      execInput: (args, input, options) => h.a.ports.execInput(args, input, { ...options, signal: options?.signal ?? rescue.signal }),
      rawExec: (args, options) => h.a.ports.rawExec(args, { ...options, signal: options?.signal ?? rescue.signal }),
    });
    const pending = store[mode]();
    void pending.catch(() => undefined);
    try {
      await Promise.race([ready, pending.then(() => { throw new Error("Sync ended before its HTTP request was admitted"); })]);
      const pids = process.platform === "win32" ? [] : (await processes()).filter(({ command }) => command.includes(url)).map(({ pid }) => pid);
      if (process.platform !== "win32") expect(pids.length).toBeGreaterThan(0);
      clock.advance(119_999);
      const waiting = Symbol("waiting");
      expect(await Promise.race([pending, delay(20).then(() => waiting)])).toBe(waiting);
      clock.advance(1);
      const ended = await Promise.race([pending, delay(1_000).then(() => waiting)]);
      expect(ended).not.toBe(waiting);
      if (typeof ended === "symbol") throw new Error("The deadline did not end the sync");
      const result = success(ended);
      if (mode === "pull") expect(result).toMatchObject({ pulls: [expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) })] });
      else expect(result).toMatchObject({ publishes: [expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) })] });
      if (firstRead) expect(result.pulls).toEqual([expect.objectContaining({ role: "read", remote: "aaa", status: "failed" })]);
      if (process.platform !== "win32") await expectEnded(pids);
      if (firstRead) await h.a.exec("git", ["remote", "remove", "aaa"]);
      else await h.a.git(["remote", "set-url", ...mode === "push" ? ["--push"] : [], h.remoteName, h.origin]);
      success(await store.push()); success(await h.b.store.pull());
      expect(success(await h.b.store.read({ reference })).content).toBe("pending\n");
    } finally {
      clock.advance(120_000); rescue.abort();
      await pending.catch(() => undefined);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);
});

it.each(["default", "separate"] as const)("names transport-setting placement for an unreachable push only where the layout isolates config (%s)", async (layout) => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
  await h.a.git(["remote", "set-url", "--push", h.remoteName, join(h.origin, "missing.git")]);
  const result = success(await h.a.store.push());
  const failed = result.publishes.find((outcome) => outcome.status === "failed");
  expect(failed).toMatchObject({ status: "failed", failure: { code: "unreachable" } });
  if (failed?.status !== "failed") throw new Error("Expected unreachable publication");
  if (layout === "separate") {
    expect(failed.failure.remedy.text).toContain("global Git config");
    expect(failed.failure.remedy.text).toContain(join(h.a.root, ".git", "arc", "store", "config"));
  } else expect(failed.failure.remedy.text).not.toContain("global Git config");
  await h.a.git(["remote", "set-url", "--push", h.remoteName, h.origin]);
  success(await h.a.store.push()); success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("pending\n");
});
