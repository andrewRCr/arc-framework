/** Record-scoped lock and stale-break coverage. */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocusLock,
  releaseLocusLock,
  serializeLocusLockHolder,
} from "../../../src/lib/locus/lock.js";
import type { ProcessInspector } from "../../../src/lib/locus/process-inspector.js";

const roots: string[] = [];
const timestamp = "2026-07-18T00:00:00.000Z";
const anchor = {
  kind: "process" as const,
  pid: 42,
  startToken: "start-42",
  inspector: "fixture",
  selector: "codex",
};

function inspector(state: "live" | "dead" | "unknown"): ProcessInspector {
  return {
    kind: "fixture",
    inspect: async () => state === "unknown"
      ? { kind: "unverifiable", reason: "fixture uncertainty" }
      : state === "dead"
        ? { kind: "absent" }
        : { kind: "present", pid: 42, parentPid: 1, startToken: "start-42", commandIdentity: "codex" },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("locus record lock", () => {
  it("grants one contender and refuses live or unknown holders without eviction", async () => {
    const path = await lockPath();
    const first = await acquireLocusLock({ path, anchor, inspector: inspector("live"), token: "a".repeat(32) });
    expect(first.kind).toBe("acquired");
    await expect(acquireLocusLock({
      path, anchor: { ...anchor, pid: 43 }, inspector: inspector("live"), token: "b".repeat(32),
      timeoutMs: 0,
    })).resolves.toMatchObject({ kind: "refused", reason: "live" });
    await expect(acquireLocusLock({
      path, anchor: { ...anchor, pid: 43 }, inspector: inspector("unknown"), token: "b".repeat(32),
      timeoutMs: 0,
    })).resolves.toMatchObject({ kind: "refused", reason: "unknown" });
    expect(await readFile(path, "utf8")).toContain(`"token":"${"a".repeat(32)}"`);
  });

  it("treats malformed, oversized, and create-before-write holders as unknown", async () => {
    const path = await lockPath();
    for (const content of ["", "{bad", "x".repeat(65 * 1024)]) {
      await writeFile(path, content);
      await expect(acquireLocusLock({
        path, anchor, inspector: inspector("dead"), token: "b".repeat(32), timeoutMs: 0,
      })).resolves.toMatchObject({ kind: "refused", reason: "unknown" });
    }
  });

  it("breaks a conclusively dead holder only under the secondary lock", async () => {
    const path = await lockPath();
    await writeFile(path, serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp }));
    const result = await acquireLocusLock({
      path,
      anchor: { ...anchor, pid: 43, startToken: "start-43" },
      inspector: inspector("dead"),
      token: "b".repeat(32),
      timeoutMs: 20,
      retryIntervalMs: 0,
    });
    expect(result).toMatchObject({ kind: "acquired", handle: { token: "b".repeat(32) } });
    await expect(readFile(`${path}.break`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("aborts stale breaking when the observed generation changes", async () => {
    const path = await lockPath();
    const replacement = serializeLocusLockHolder({
      token: "c".repeat(32),
      anchor: { ...anchor, pid: 44, startToken: "start-44" },
      createdAt: timestamp,
    });
    await writeFile(path, serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp }));
    let changed = false;
    const result = await acquireLocusLock({
      path,
      anchor: { ...anchor, pid: 43, startToken: "start-43" },
      inspector: inspector("dead"),
      token: "b".repeat(32),
      timeoutMs: 0,
      beforeBreakRecheck: async () => {
        if (!changed) {
          changed = true;
          await writeFile(path, replacement);
        }
      },
    });
    expect(result).toMatchObject({ kind: "refused" });
    expect(await readFile(path)).toEqual(replacement);
  });

  it("releases only a byte-equivalent owned generation and tolerates absence", async () => {
    const path = await lockPath();
    const result = await acquireLocusLock({ path, anchor, inspector: inspector("live"), token: "a".repeat(32) });
    if (result.kind !== "acquired") throw new Error("fixture acquisition failed");
    const replacement = serializeLocusLockHolder({ token: "b".repeat(32), anchor, createdAt: timestamp });
    await writeFile(path, replacement);
    await expect(releaseLocusLock(result.handle)).resolves.toEqual({ kind: "not-owner" });
    expect(await readFile(path)).toEqual(replacement);
    await rm(path);
    await expect(releaseLocusLock(result.handle)).resolves.toEqual({ kind: "released" });
  });
});

async function lockPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-locus-lock-"));
  roots.push(root);
  return join(root, "locus-a.lock");
}
