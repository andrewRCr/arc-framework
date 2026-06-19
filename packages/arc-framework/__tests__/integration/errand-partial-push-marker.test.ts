/**
 * Integration tests for the errand-ref partial-push marker — the errand leg's
 * independent mirror of the notes partial-push marker. Verifies the marker
 * captures the errand ref hash, survives a notes save and a notes-marker clear,
 * and that clearing it leaves the notes marker intact.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  makeUserIO,
  execFileAsync,
  type UserIOContext,
} from "../helpers/integration.js";
import {
  writeLocalSyncState,
  readLocalSyncState,
  recordPartialPushMarker,
  clearPartialPushMarker,
  recordErrandPartialPushMarker,
  clearErrandPartialPushMarker,
} from "../../src/lib/user-sync/index.js";
import { writeErrandRecord, errandsRef } from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";

describe("errand-ref partial-push marker", () => {
  let dir: string;
  let io: UserIOContext;
  let head: string;

  beforeEach(async () => {
    dir = await createTempRepo();
    head = await makeCommit(dir, "init");
    io = makeUserIO(dir);
    // A notes ref must exist for the notes-marker recorder to capture its hash.
    await execFileAsync(
      "git", ["notes", "--ref", `arc/user/${IDENTITY}`, "add", "-m", "note", head], { cwd: dir },
    );
    await writeLocalSyncState(dir, io, IDENTITY, "manifest-hash", head, "save");
    // An errand ref must exist for the marker to capture its hash.
    await writeErrandRecord(
      { exec: io.exec, execInput: io.execInput!, identity: IDENTITY },
      {
        version: 1,
        slug: "an-errand",
        origin: "description",
        intent: "do an-errand",
        branch: "chore/an-errand",
        createdAt: "2026-06-19T12:00:00.000Z",
      },
    );
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  async function errandRefHash(): Promise<string> {
    const { stdout } = await execFileAsync(
      "git", ["rev-parse", "--verify", errandsRef(IDENTITY)], { cwd: dir },
    );
    return stdout.trim();
  }

  it("records the marker capturing the local errand ref hash", async () => {
    expect(await recordErrandPartialPushMarker(dir, io, IDENTITY)).toBe(true);

    const state = await readLocalSyncState(dir, io, IDENTITY);
    expect(state?.partialPushErrand?.localRefHash).toBe(await errandRefHash());
  });

  it("carries the errand marker forward across a notes save", async () => {
    await recordErrandPartialPushMarker(dir, io, IDENTITY);

    // A user-directory save resolves the *notes* partial-push but not the errand one.
    await writeLocalSyncState(dir, io, IDENTITY, "manifest-hash-2", head, "save");

    const state = await readLocalSyncState(dir, io, IDENTITY);
    expect(state?.partialPushErrand?.localRefHash).toBe(await errandRefHash());
  });

  it("keeps the errand marker when the notes marker is cleared", async () => {
    await recordPartialPushMarker(dir, io, IDENTITY);
    await recordErrandPartialPushMarker(dir, io, IDENTITY);

    await clearPartialPushMarker(dir, io, IDENTITY);

    const state = await readLocalSyncState(dir, io, IDENTITY);
    expect(state?.partialPush).toBeUndefined();
    expect(state?.partialPushErrand).toBeDefined();
  });

  it("clears the errand marker while leaving the notes marker intact", async () => {
    await recordPartialPushMarker(dir, io, IDENTITY);
    await recordErrandPartialPushMarker(dir, io, IDENTITY);

    await clearErrandPartialPushMarker(dir, io, IDENTITY);

    const state = await readLocalSyncState(dir, io, IDENTITY);
    expect(state?.partialPushErrand).toBeUndefined();
    expect(state?.partialPush).toBeDefined();
  });
});
