/**
 * Integration tests for the sibling sync-state ref transport primitives.
 *
 * Runs against a real temporary git repo to verify per-machine entries write to
 * and read from `refs/arc/user/{identity}/sync-state` as a tree of blobs keyed
 * by `machineId`, that a write touches only the writer's own key, and that the
 * fetch force-updates a local tracking ref from origin (the reconcile input a
 * later phase consumes).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";
import {
  syncStateRef,
  incomingSyncStateRef,
  readEntries,
  readEntry,
  writeEntry,
  pushSyncStateRef,
  fetchSyncStateRef,
  type SyncStateRefIO,
} from "../../src/lib/user-sync/sync-state-ref.js";
import { readTreeEntries } from "../../src/lib/git/ref-tree.js";
import {
  readSyncStateMarker,
  serializeSyncStateMarker,
  writeSyncStateMarker,
  type SyncStateMarker,
} from "../../src/lib/user-sync/sync-state-marker.js";

const IDENTITY = "andrew";

function markerFor(machineId: string, overrides: Partial<SyncStateMarker> = {}): SyncStateMarker {
  return {
    version: 1,
    machineId,
    lastAttemptedCommit: "a".repeat(40),
    attemptTimestamp: "2026-06-25T12:00:00.000Z",
    intent: "b".repeat(40),
    ...overrides,
  };
}

describe("sync-state ref transport primitives", () => {
  let dir: string;
  let io: SyncStateRefIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    // An orphan state-ref needs no commit history, but a HEAD keeps the repo in
    // a normal state and gives the force-update test an unrelated commit to use.
    await makeCommit(dir, "init");
    io = { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
  });

  afterEach(async () => {
    try {
      await cleanupTempDir(dir);
    } catch {
      // ignored
    }
  });

  // --- 1.2.a: ref naming and entry read ---

  it("resolves the ref to refs/arc/user/{identity}/sync-state", () => {
    expect(syncStateRef(IDENTITY)).toBe("refs/arc/user/andrew/sync-state");
  });

  it("reads an absent ref as an empty entry set without throwing", async () => {
    expect(await readEntries(io)).toEqual(new Map());
    expect(await readEntry(io, "anything")).toBeNull();
  });

  it("reads a multi-entry tree keyed by machineId", async () => {
    await writeEntry(io, "machine-a", "alpha");
    await writeEntry(io, "machine-b", "beta");
    await writeEntry(io, "machine-c", "gamma");

    const keys = [...(await readEntries(io)).keys()].sort();
    expect(keys).toEqual(["machine-a", "machine-b", "machine-c"]);
  });

  // --- 1.2.b: entry write, commit, and remote transport ---

  it("round-trips an entry written then read back unchanged", async () => {
    const payload = JSON.stringify({ machineId: "machine-a", lastAttemptedCommit: "deadbeef" });
    await writeEntry(io, "machine-a", payload);

    expect(await readEntry(io, "machine-a")).toBe(payload);
  });

  it("overwrites a machine's own key in place on a re-write", async () => {
    await writeEntry(io, "machine-a", "first");
    await writeEntry(io, "machine-a", "second");

    expect(await readEntry(io, "machine-a")).toBe("second");
    expect([...(await readEntries(io)).keys()]).toEqual(["machine-a"]);
  });

  it("touches only the writer's own key — other machines' entries are preserved", async () => {
    await writeEntry(io, "machine-a", "a-original");
    await writeEntry(io, "machine-b", "b-original");

    await writeEntry(io, "machine-a", "a-revised");

    expect(await readEntry(io, "machine-a")).toBe("a-revised");
    expect(await readEntry(io, "machine-b")).toBe("b-original");
  });

  it("fetch force-updates the local tracking ref from origin", async () => {
    await addBareRemote(dir);
    await writeEntry(io, "machine-a", "alpha");
    await pushSyncStateRef(io);

    const ref = syncStateRef(IDENTITY);
    const incoming = incomingSyncStateRef(ref);
    // Point the tracking ref at an unrelated commit so a non-force fetch would
    // reject — the sync-state tip is an orphan commit, not a descendant of HEAD,
    // so only the force refspec advances the tracking ref to origin's tip.
    const { stdout: initSha } = await io.exec("git", ["rev-parse", "HEAD"]);
    await io.exec("git", ["update-ref", incoming, initSha.trim()]);

    await fetchSyncStateRef(io);

    const { stdout: refTip } = await io.exec("git", ["rev-parse", ref]);
    const { stdout: incomingTip } = await io.exec("git", ["rev-parse", incoming]);
    expect(incomingTip.trim()).toBe(refTip.trim());
    expect(incomingTip.trim()).not.toBe(initSha.trim());
    expect([...(await readTreeEntries(io.exec, incoming)).keys()]).toEqual(["machine-a"]);
  });
});

describe("sync-state marker over the ref", () => {
  let dir: string;
  let io: SyncStateRefIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    io = { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
  });

  afterEach(async () => {
    try {
      await cleanupTempDir(dir);
    } catch {
      // ignored
    }
  });

  it("round-trips a typed marker written then read back by machineId", async () => {
    const marker = markerFor("machine-a");
    await writeSyncStateMarker(io, marker);

    expect(await readSyncStateMarker(io, "machine-a")).toEqual(marker);
  });

  it("reads an absent machine's marker back as null", async () => {
    await writeSyncStateMarker(io, markerFor("machine-a"));

    expect(await readSyncStateMarker(io, "machine-b")).toBeNull();
  });

  it("writes each machine's marker under its own key without disturbing the other", async () => {
    await writeSyncStateMarker(io, markerFor("machine-a", { intent: "a".repeat(40) }));
    await writeSyncStateMarker(io, markerFor("machine-b", { intent: "b".repeat(40) }));

    expect((await readSyncStateMarker(io, "machine-a"))?.intent).toBe("a".repeat(40));
    expect((await readSyncStateMarker(io, "machine-b"))?.intent).toBe("b".repeat(40));
  });

  it("rejects a blob whose embedded machineId disagrees with its tree key", async () => {
    // The tree key is the ownership boundary — a blob read under `machine-a`
    // that claims to be `machine-b` is malformed untrusted data, not a valid
    // cross-machine alias.
    await writeEntry(io, "machine-a", serializeSyncStateMarker(markerFor("machine-b")));

    expect(await readSyncStateMarker(io, "machine-a")).toBeNull();
  });
});
