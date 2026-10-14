/** A recorded push gate verdict tells the pushing command why the gate refused, and only for its own push. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPushGateRefusal, writePushGateRecord } from "../../../../src/lib/checks/push-gate-record.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "arc-push-gate-"));
  roots.push(path);
  return path;
}

const read = (path: string): Promise<string> => readFile(path, "utf8");
const write = (path: string, content: string): Promise<void> => writeFile(path, content);
const failing = { id: "lint:md:underwrap", outcome: "failed", logPath: "/logs/underwrap.log",
  remedy: "arc check run lint:md:underwrap --range 09acc77cf" };

describe("push gate record", () => {
  it("returns the failing checks the gate recorded for the pushed ref", async () => {
    const dir = await directory();
    await writePushGateRecord(dir, { recordedAt: 2_000, refs: ["refs/heads/topic"], refused: true, checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read }))
      .toEqual({ checks: [failing] });
  });

  it("returns the error that stopped the gate from running its checks", async () => {
    const dir = await directory();
    await writePushGateRecord(dir, { recordedAt: 2_000, refs: [], refused: true, error: "arc dev build is stale", checks: [] },
      write);

    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read }))
      .toEqual({ error: "arc dev build is stale", checks: [] });
  });

  it("reports no refusal when the gate passed, so the failure lies elsewhere", async () => {
    const dir = await directory();
    await writePushGateRecord(dir, { recordedAt: 2_000, refs: ["refs/heads/topic"], refused: false, checks: [] }, write);

    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read })).toBeNull();
  });

  it("ignores a verdict recorded before this push started", async () => {
    const dir = await directory();
    await writePushGateRecord(dir, { recordedAt: 999, refs: ["refs/heads/topic"], refused: true, checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read })).toBeNull();
  });

  it("ignores a verdict for another ref", async () => {
    const dir = await directory();
    await writePushGateRecord(dir, { recordedAt: 2_000, refs: ["refs/heads/other"], refused: true, checks: [failing] }, write);

    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read })).toBeNull();
  });

  it("reports no refusal when nothing was recorded or the record is unreadable", async () => {
    const dir = await directory();
    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read })).toBeNull();

    await writePushGateRecord(dir, { recordedAt: 2_000, refs: ["refs/heads/topic"], refused: true, checks: [failing] }, write);
    const [name] = await readdir(dir);
    if (name === undefined) throw new Error("No push gate record was written");
    await writeFile(join(dir, name), "{not json");
    expect(await readPushGateRefusal({ directory: dir, ref: "refs/heads/topic", since: 1_000, readFile: read })).toBeNull();
  });
});
