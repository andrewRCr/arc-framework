/** Record-scoped lock and stale-break coverage. */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocusLock,
  breakDeadLocusLock,
  readLocusLockHolder,
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

/** Distinguishes the main holder from its breaker, which share no liveness. */
function inspectorByPid(states: Record<number, "live" | "dead" | "unknown">): ProcessInspector {
  return {
    kind: "fixture",
    inspect: async (pid) => {
      const state = states[pid] ?? "dead";
      if (state === "unknown") return { kind: "unverifiable", reason: "fixture uncertainty" };
      if (state === "dead") return { kind: "absent" };
      return { kind: "present", pid, parentPid: 1, startToken: `start-${pid}`, commandIdentity: "codex" };
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("locus record lock", () => {
  it("admits an unverifiable command anchor while preserving unknown stale-holder safety", async () => {
    const path = await lockPath();
    const unverifiable = { kind: "unverifiable" as const, reason: "process inspection unavailable" };
    const first = await acquireLocusLock({
      path,
      anchor: unverifiable,
      inspector: inspector("unknown"),
      token: "a".repeat(32),
    });
    expect(first).toMatchObject({ kind: "acquired", handle: { anchor: unverifiable } });
    await expect(acquireLocusLock({
      path,
      anchor,
      inspector: inspector("dead"),
      token: "b".repeat(32),
      timeoutMs: 0,
    })).resolves.toMatchObject({ kind: "refused", reason: "unknown" });
    if (first.kind !== "acquired") throw new Error("fixture acquisition failed");
    await expect(releaseLocusLock(first.handle)).resolves.toEqual({ kind: "released" });
  });

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

  it("does not restart acquisition after a dead-holder break exhausts the deadline", async () => {
    const path = await lockPath();
    await writeFile(path, serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp }));

    await expect(acquireLocusLock({
      path,
      anchor: { ...anchor, pid: 43, startToken: "start-43" },
      inspector: inspector("dead"),
      token: "b".repeat(32),
      timeoutMs: 0,
    })).resolves.toEqual({ kind: "refused", reason: "timeout" });
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
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

  it("breaks an exact dead proof directly without acquiring the main lock", async () => {
    const path = await lockPath();
    const bytes = serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp });
    await writeFile(path, bytes);
    const observed = await readLocusLockHolder(path);
    if (observed.kind !== "valid") throw new Error("expected valid holder");
    const breakerAnchor = { ...anchor, pid: 43, startToken: "start-43" };
    let secondary: Awaited<ReturnType<typeof readLocusLockHolder>> | null = null;
    await expect(breakDeadLocusLock({
      path,
      observed,
      inspector: inspector("dead"),
      breakerToken: "b".repeat(32),
      breakerAnchor,
      // The secondary lock is process-anchored like the main one, which is what
      // lets a later breaker tell dead residue from a live competitor.
      beforeBreakRecheck: async () => {
        secondary = await readLocusLockHolder(`${path}.break`);
      },
    })).resolves.toEqual({ kind: "broken" });
    expect(secondary).toMatchObject({ kind: "valid", holder: { token: "b".repeat(32), anchor: breakerAnchor } });
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${path}.break`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reclaims secondary-lock residue left by a conclusively dead breaker", async () => {
    const path = await lockPath();
    await writeFile(path, serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp }));
    // A breaker that exited between its exclusive create and its release.
    await writeFile(`${path}.break`, serializeLocusLockHolder({
      token: "c".repeat(32),
      anchor: { ...anchor, pid: 44, startToken: "start-44" },
      createdAt: timestamp,
    }));

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

  it("keeps excluding competitors while a breaker is live, unverifiable, or unreadable", async () => {
    const breakerAnchor = { ...anchor, pid: 44, startToken: "start-44" };
    for (const residue of [
      serializeLocusLockHolder({ token: "c".repeat(32), anchor: breakerAnchor, createdAt: timestamp }),
      serializeLocusLockHolder({
        token: "c".repeat(32),
        anchor: { kind: "unverifiable", reason: "process inspection unavailable" },
        createdAt: timestamp,
      }),
      Buffer.from("c".repeat(32), "utf8"),
    ]) {
      const path = await lockPath();
      const held = serializeLocusLockHolder({ token: "a".repeat(32), anchor, createdAt: timestamp });
      await writeFile(path, held);
      await writeFile(`${path}.break`, residue);

      // The main holder is dead, so the break is attempted and reaches the
      // secondary lock — a live breaker still owns it.
      await expect(acquireLocusLock({
        path,
        anchor: { ...anchor, pid: 43, startToken: "start-43" },
        inspector: inspectorByPid({ 42: "dead", 44: "live" }),
        token: "b".repeat(32),
        timeoutMs: 0,
      })).resolves.toEqual({ kind: "refused", reason: "unknown" });
      expect(await readFile(`${path}.break`)).toEqual(residue);
      expect(await readFile(path)).toEqual(held);
    }
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
