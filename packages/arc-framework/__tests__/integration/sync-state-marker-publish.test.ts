/**
 * Integration tests for publishSyncStateMarker — the producer-side compose that
 * writes this machine's outstanding notes-push intent and pushes it to the
 * sibling sync-state ref ahead of the user-notes leg. Exercised against real
 * temp repos so the machine-id persistence, marker payload, and reconcile-push
 * run end-to-end.
 *
 * Covers the publish path (a landed marker affording short-sha / when / whose,
 * with the liveness predicate reading live before notes land and fulfilled
 * after) plus the SC-8 no-write paths: an absent local notes ref and a
 * remoteless repo both skip without disturbing the ref.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeUserIO,
  makeGitExecInput,
  execFileAsync,
  type UserIOContext,
} from "../helpers/integration.js";
import { publishSyncStateMarker } from "../../src/lib/user-sync/sync-state-publish.js";
import {
  syncStateRef,
  type SyncStateRefIO,
} from "../../src/lib/user-sync/sync-state-ref.js";
import {
  readSyncStateMarker,
  evaluateMarkerLiveness,
  type AncestryResolver,
} from "../../src/lib/user-sync/sync-state-marker.js";
import { isContainedIn } from "../../src/lib/git/branch-containment.js";
import { getOrCreateMachineId } from "../../src/lib/user-sync/sync-state.js";

const IDENTITY = "andrew";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;
const REF = syncStateRef(IDENTITY);

/** Seed a local user-notes ref by annotating HEAD; returns the notes-ref tip sha. */
async function seedNotesRef(repo: string): Promise<string> {
  await execFileAsync(
    "git",
    ["notes", `--ref=${NOTES_REF}`, "add", "-m", "session notes", "HEAD"],
    { cwd: repo },
  );
  const { stdout } = await execFileAsync("git", ["rev-parse", NOTES_REF], { cwd: repo });
  return stdout.trim();
}

async function revParse(repo: string, rev: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", rev], { cwd: repo });
  return stdout.trim();
}

/** Entry keys present on the remote sync-state ref, read from the repo's origin. */
async function remoteKeys(repo: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "origin", REF], { cwd: repo });
  if (stdout.trim() === "") return [];
  const tip = stdout.trim().split(/\s+/u)[0];
  const { stdout: ls } = await execFileAsync(
    "git",
    ["ls-tree", "--name-only", `${tip}^{tree}`],
    { cwd: repo },
  );
  return ls.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

function refIoFor(repo: string, io: UserIOContext): SyncStateRefIO {
  return { exec: io.exec, execInput: makeGitExecInput(repo), identity: IDENTITY };
}

describe("publishSyncStateMarker", () => {
  let repo: string;
  let io: UserIOContext;

  beforeEach(async () => {
    repo = await createTempRepo();
    await makeCommit(repo, "init");
    io = makeUserIO(repo);
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("publishes the marker ahead of notes, affording short-sha / when / whose and a live intent", async () => {
    const remoteDir = await addBareRemote(repo);
    try {
      const notesTip = await seedNotesRef(repo);
      const head = await revParse(repo, "HEAD");
      const now = "2026-06-25T12:00:00.000Z";

      const outcome = await publishSyncStateMarker({
        cwd: repo,
        io,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
        now,
      });
      expect(outcome).toEqual({ kind: "published" });

      const machineId = await getOrCreateMachineId(repo, io, IDENTITY);
      expect(await remoteKeys(repo)).toEqual([notesTip]);

      const marker = await readSyncStateMarker(refIoFor(repo, io), notesTip);
      expect(marker).toEqual({
        version: 1,
        machineId,
        lastAttemptedCommit: head,
        attemptTimestamp: now,
        intent: notesTip,
      });

      // Liveness reads reachability against origin's real notes ref via isContainedIn —
      // the production primitive the session-init consumer wires in.
      const isReachable: AncestryResolver = (ancestor, descendant) =>
        isContainedIn(io.exec, ancestor, descendant);

      // Notes have not landed at origin yet → the intent is live (unfulfilled).
      expect(await evaluateMarkerLiveness(marker!, null, isReachable)).toBe("live");
      // Once origin's notes ref reaches the recorded intent → fulfilled (self-invalidated).
      expect(await evaluateMarkerLiveness(marker!, notesTip, isReachable)).toBe("fulfilled");

      // A later notes push advances origin's ref to a *descendant* of the recorded intent.
      // The intent's notes have still landed, so the marker stays fulfilled — reachability,
      // not exact-tip equality (the case exact equality wrongly kept live until the TTL).
      await execFileAsync(
        "git",
        ["notes", `--ref=${NOTES_REF}`, "append", "-m", "a later note", "HEAD"],
        { cwd: repo },
      );
      const advancedTip = await revParse(repo, NOTES_REF);
      expect(advancedTip).not.toBe(notesTip);
      expect(await evaluateMarkerLiveness(marker!, advancedTip, isReachable)).toBe("fulfilled");
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("no-write path: an absent local notes ref skips without touching the ref", async () => {
    const remoteDir = await addBareRemote(repo);
    try {
      const outcome = await publishSyncStateMarker({
        cwd: repo,
        io,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
      });
      expect(outcome).toEqual({ kind: "skipped", reason: "no-notes-ref" });
      expect(await remoteKeys(repo)).toEqual([]);
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("records an explicit planned notes-export target instead of the raw local notes tip", async () => {
    const remoteDir = await addBareRemote(repo);
    try {
      const rawLocalTip = await seedNotesRef(repo);
      const plannedTarget = "f".repeat(40);
      const head = await revParse(repo, "HEAD");
      const now = "2026-06-25T12:30:00.000Z";

      const outcome = await publishSyncStateMarker({
        cwd: repo,
        io,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
        intent: plannedTarget,
        now,
      });
      expect(outcome).toEqual({ kind: "published" });

      const machineId = await getOrCreateMachineId(repo, io, IDENTITY);
      expect(await remoteKeys(repo)).toEqual([plannedTarget]);

      const marker = await readSyncStateMarker(refIoFor(repo, io), plannedTarget);
      expect(marker).toEqual({
        version: 1,
        machineId,
        lastAttemptedCommit: head,
        attemptTimestamp: now,
        intent: plannedTarget,
      });
      expect(marker?.intent).not.toBe(rawLocalTip);
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("keeps two unresolved same-machine intents as separate sync-state entries", async () => {
    const remoteDir = await addBareRemote(repo);
    try {
      const intentA = "a".repeat(40);
      const intentB = "b".repeat(40);
      const commitA = await revParse(repo, "HEAD");
      await makeCommit(repo, "second intent worktree commit");
      const commitB = await revParse(repo, "HEAD");

      const first = await publishSyncStateMarker({
        cwd: repo,
        io,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
        intent: intentA,
        lastAttemptedCommit: commitA,
        now: "2026-06-25T12:00:00.000Z",
      });
      expect(first).toEqual({ kind: "published" });

      const second = await publishSyncStateMarker({
        cwd: repo,
        io,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
        intent: intentB,
        lastAttemptedCommit: commitB,
        now: "2026-06-25T12:05:00.000Z",
      });
      expect(second).toEqual({ kind: "published" });

      const machineId = await getOrCreateMachineId(repo, io, IDENTITY);
      expect(await remoteKeys(repo)).toEqual([intentA, intentB].sort());
      expect(await readSyncStateMarker(refIoFor(repo, io), intentA)).toMatchObject({
        machineId,
        lastAttemptedCommit: commitA,
        intent: intentA,
      });
      expect(await readSyncStateMarker(refIoFor(repo, io), intentB)).toMatchObject({
        machineId,
        lastAttemptedCommit: commitB,
        intent: intentB,
      });
    } finally {
      await cleanupTempDir(remoteDir);
    }
  });

  it("no-write path: a remoteless repo skips on the push without throwing", async () => {
    // No origin configured — the local ref write succeeds but the push has
    // nowhere to land; the helper degrades safe rather than surfacing an error.
    await seedNotesRef(repo);

    const outcome = await publishSyncStateMarker({
      cwd: repo,
      io,
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
    });
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") {
      expect(outcome.reason).toBe("no-remote");
    }
  });
});
