/** A recorded push gate refusal tells the pushing command why the gate refused, and only for its own push. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPushGateId, isPushGateId, readPushGateRefusal, writePushGateRefusal,
} from "../../../../src/lib/checks/push-gate-record.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "arc-push-gate-"));
  roots.push(path);
  return path;
}

const read = (path: string): Promise<string> => readFile(path, "utf8");
const write = (path: string, content: string): Promise<void> => writeFile(path, content);
const remove = (path: string): Promise<void> => rm(path, { force: true });
const failing = { id: "lint:md:underwrap", outcome: "failed", logPath: "/logs/underwrap.log",
  remedy: "arc check run lint:md:underwrap --range 09acc77cf" };

describe("push gate record", () => {
  it("returns the failing checks recorded for this push, then removes the record", async () => {
    const dir = await directory();
    const pushGateId = createPushGateId();
    await writePushGateRefusal(dir, pushGateId, { checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, pushGateId, readFile: read, removeFile: remove }))
      .toEqual({ checks: [failing] });
    expect(await readdir(dir)).toEqual([]);
    expect(await readPushGateRefusal({ directory: dir, pushGateId, readFile: read, removeFile: remove })).toBeNull();
  });

  it("returns the error that stopped the gate from running its checks", async () => {
    const dir = await directory();
    const pushGateId = createPushGateId();
    await writePushGateRefusal(dir, pushGateId, { error: "arc dev build is stale", checks: [] }, write);

    expect(await readPushGateRefusal({ directory: dir, pushGateId, readFile: read, removeFile: remove }))
      .toEqual({ error: "arc dev build is stale", checks: [] });
  });

  it("never answers for another push, and leaves that push's record in place", async () => {
    const dir = await directory();
    const own = createPushGateId();
    const other = createPushGateId();
    await writePushGateRefusal(dir, other, { checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, pushGateId: own, readFile: read, removeFile: remove })).toBeNull();
    expect(await readPushGateRefusal({ directory: dir, pushGateId: other, readFile: read, removeFile: remove }))
      .toEqual({ checks: [failing] });
  });

  it("reports no refusal when the record is unreadable, and removes it", async () => {
    const dir = await directory();
    const pushGateId = createPushGateId();
    await writePushGateRefusal(dir, pushGateId, { checks: [failing] }, write);
    const [name] = await readdir(dir);
    if (name === undefined) throw new Error("No push gate record was written");
    await writeFile(join(dir, name), "{not json");

    expect(await readPushGateRefusal({ directory: dir, pushGateId, readFile: read, removeFile: remove })).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it("returns the refusal even when the record cannot be removed", async () => {
    const dir = await directory();
    const pushGateId = createPushGateId();
    await writePushGateRefusal(dir, pushGateId, { checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, pushGateId, readFile: read,
      removeFile: async () => { throw new Error("read-only filesystem"); } })).toEqual({ checks: [failing] });
  });

  it("accepts only identifiers that cannot name a path outside the record directory", async () => {
    expect(isPushGateId(createPushGateId())).toBe(true);
    for (const value of [undefined, "", "../../etc/passwd", "ABCDEF0123456789ABCDEF0123456789", "a".repeat(31)]) {
      expect(isPushGateId(value)).toBe(false);
    }
    await expect(writePushGateRefusal(await directory(), "../escape", { checks: [] }, write)).rejects.toThrow(/identifier/u);
  });
});
