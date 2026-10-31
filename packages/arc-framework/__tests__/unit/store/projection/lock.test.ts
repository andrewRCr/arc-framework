/** The projection lock over real lockfiles in a worktree's Git directory. */
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_LEASE_PROCESS } from "../../../../src/lib/lease-process.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import {
  PROJECTION_LOCK_FILE, SIBLING_LOCK_WAIT_MS, withProjectionLock,
} from "../../../../src/lib/store/projection/lock.js";

let gitDir: string;
let location: ProjectionLocation;
beforeEach(async () => {
  gitDir = await mkdtemp(join(tmpdir(), "arc-projection-lock-"));
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
});
afterEach(async () => { await rm(gitDir, { recursive: true, force: true }); });

async function exists(path: string): Promise<boolean> { return access(path).then(() => true, () => false); }

/** A lockfile reader that removes the worktree's Git directory just after its first read once armed. */
function removingAfterFirstRead(armed: () => boolean = () => true): (path: string) => Promise<string> {
  let removed = false;
  return async (path) => {
    const text = await readFile(path, "utf8");
    if (armed() && !removed) {
      removed = true;
      await rm(gitDir, { recursive: true, force: true });
    }
    return text;
  };
}

/** Hold the lock until the returned release is called, resolving once it is taken. */
async function hold(): Promise<{ release: () => void; done: Promise<unknown> }> {
  let release = (): void => undefined;
  let taken = (): void => undefined;
  const isTaken = new Promise<void>((resolve) => { taken = resolve; });
  const done = withProjectionLock(location, async () => {
    taken();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await isTaken;
  return { release, done };
}

describe("the projection lock", () => {
  it("skips a sibling held past the bounded wait, and takes one released within it", async () => {
    const holder = await hold();
    expect((await withProjectionLock(location, async () => "skipped", { maxWaitMs: SIBLING_LOCK_WAIT_MS })).status)
      .toBe("held");
    const waiting = withProjectionLock(location, async () => "taken", { maxWaitMs: SIBLING_LOCK_WAIT_MS });
    setTimeout(holder.release, 20);
    expect(await waiting).toEqual({ status: "done", value: "taken" });
    await holder.done;
    expect(await exists(join(location.stateDir, PROJECTION_LOCK_FILE))).toBe(false);
  });

  it("skips a worktree whose Git directory is gone before the attempt, creating nothing", async () => {
    await rm(gitDir, { recursive: true, force: true });
    expect(await withProjectionLock(location, async () => "ran")).toEqual({ status: "gone" });
    expect(await exists(gitDir)).toBe(false);
  });

  it("skips a worktree whose Git directory is removed while the writer waits, creating nothing", async () => {
    const holder = await hold();
    expect(await withProjectionLock(location, async () => "ran", {}, { readFile: removingAfterFirstRead() }))
      .toEqual({ status: "gone" });
    holder.release();
    await holder.done;
    expect(await exists(gitDir)).toBe(false);
  });

  it.each([
    ["the holder", undefined, expect.objectContaining({ pid: process.pid, processInstance: NATIVE_LEASE_PROCESS.processInstance })],
    ["an unreadable holder", async (): Promise<string> => { throw Object.assign(new Error("denied"), { code: "EACCES" }); },
      "unreadable"],
  ] as const)("reports %s it last saw when its own wait times out", async (_case, readHolder, holder) => {
    const held = await hold();
    const overrides = readHolder === undefined ? {} : { readFile: readHolder };
    expect(await withProjectionLock(location, async () => "ran", { maxWaitMs: 50 }, overrides))
      .toEqual({ status: "held", holder });
    held.release();
    await held.done;
  });

  it("ends the operation at its next step, reported, when a renewal finds the Git directory removed", async () => {
    let tick = (): void => undefined;
    let armed = false;
    const terminated: string[] = [];
    const result = await withProjectionLock(location, async (session) => {
      armed = true;
      // The first renewal reads the holder, then finds the folder gone; the second, queued behind it, finds no holder.
      tick();
      tick();
      await vi.waitFor(() => { expect(() => { session.step(); }).toThrow(); });
      session.step();
      return "finished";
    }, {}, {
      readFile: removingAfterFirstRead(() => armed),
      scheduleEvery: (callback) => { tick = callback; return () => undefined; },
      terminateProcess: () => { terminated.push("terminated"); },
    });
    expect(result).toEqual({ status: "lost", report: expect.stringContaining("ownership was lost") });
    expect(terminated).toEqual([]);
    expect(await exists(gitDir)).toBe(false);
  });

  it("keeps the operation's result when a release finds the Git directory removed after reading the holder", async () => {
    let armed = false;
    const result = await withProjectionLock(location, async () => { armed = true; return "kept"; }, {},
      { readFile: removingAfterFirstRead(() => armed) });
    expect(result).toEqual({ status: "done", value: "kept" });
    expect(await exists(gitDir)).toBe(false);
  });
});
