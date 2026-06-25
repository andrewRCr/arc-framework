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
} from "../../src/lib/user-sync/sync-state-marker.js";
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

/** Machine keys present on the remote sync-state ref, read from the repo's origin. */
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
      expect(await remoteKeys(repo)).toEqual([machineId]);

      const marker = await readSyncStateMarker(refIoFor(repo, io), machineId);
      expect(marker).toEqual({
        version: 1,
        machineId,
        lastAttemptedCommit: head,
        attemptTimestamp: now,
        intent: notesTip,
      });

      // Notes have not landed at origin yet → the intent is live (unfulfilled).
      expect(evaluateMarkerLiveness(marker!, null)).toBe("live");
      // Once origin's notes ref reaches the recorded intent → fulfilled (self-invalidated).
      expect(evaluateMarkerLiveness(marker!, notesTip)).toBe("fulfilled");
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
