/**
 * Integration tests for the sync-state-ref reconcile-push across two clones of a
 * shared remote — the real fetch / union-merge / retry path. A second clone
 * stands in for the other machine: it writes its own marker without the first
 * clone's ref, so its push is a genuine non-fast-forward the reconcile resolves
 * by union. A final case wraps the executor to reject every push, proving the
 * retry loop is bounded rather than looping forever.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeGitExec,
  makeGitExecInput,
  execFileAsync,
} from "../helpers/integration.js";
import {
  reconcileSyncStatePush,
  MAX_RECONCILE_ATTEMPTS,
} from "../../src/lib/user-sync/sync-state-merge.js";
import {
  syncStateRef,
  pushSyncStateRef,
  type SyncStateRefIO,
} from "../../src/lib/user-sync/sync-state-ref.js";
import {
  readSyncStateMarker,
  writeSyncStateMarker,
  type SyncStateMarker,
} from "../../src/lib/user-sync/sync-state-marker.js";
import type { GitExec } from "../../src/lib/git/exec.js";

const IDENTITY = "andrew";
const REF = syncStateRef(IDENTITY);
const MACHINE_A = "machine-a";
const MACHINE_B = "machine-b";

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

function ioFor(dir: string): SyncStateRefIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

async function cloneOf(remoteDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-sync-state-clone-"));
  await execFileAsync("git", ["clone", remoteDir, dir]);
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: dir });
  return dir;
}

/** Machine keys present on the remote sync-state ref, read from a clone. */
async function remoteKeys(dir: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "origin", REF], { cwd: dir });
  if (stdout.trim() === "") return [];
  const { stdout: ls } = await execFileAsync(
    "git",
    ["ls-tree", "--name-only", `${stdout.trim().split(/\s+/u)[0]}^{tree}`],
    { cwd: dir },
  );
  return ls.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

describe("sync-state-ref reconcile-push", () => {
  let remoteDir: string;
  let repoA: string;
  let repoB: string;
  let ioA: SyncStateRefIO;
  let ioB: SyncStateRefIO;

  beforeEach(async () => {
    repoA = await createTempRepo();
    await makeCommit(repoA, "init");
    remoteDir = await addBareRemote(repoA);
    repoB = await cloneOf(remoteDir);
    ioA = ioFor(repoA);
    ioB = ioFor(repoB);
  });

  afterEach(async () => {
    await Promise.all([repoA, repoB, remoteDir].map(cleanupTempDir));
  });

  it("pushes a clean first push without a reconcile pass", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));

    expect(await reconcileSyncStatePush(ioA, MACHINE_A)).toEqual({ kind: "pushed" });
    expect(await remoteKeys(repoA)).toEqual([MACHINE_A]);
  });

  it("is a no-op when there is no local ref to push", async () => {
    expect(await reconcileSyncStatePush(ioA, MACHINE_A)).toEqual({ kind: "noop" });
  });

  it("unions both machines' entries over a non-fast-forward push", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await reconcileSyncStatePush(ioA, MACHINE_A);

    // repoB never fetched the ref, so its write forks a divergent root.
    await writeSyncStateMarker(ioB, markerFor(MACHINE_B));
    expect(await reconcileSyncStatePush(ioB, MACHINE_B)).toEqual({ kind: "reconciled" });

    expect(await remoteKeys(repoB)).toEqual([MACHINE_A, MACHINE_B]);
    // Both markers survive the union — neither machine's entry is lost.
    expect((await readSyncStateMarker(ioB, MACHINE_A))?.machineId).toBe(MACHINE_A);
    expect((await readSyncStateMarker(ioB, MACHINE_B))?.machineId).toBe(MACHINE_B);
  });

  it("bounds the retry loop and surfaces a definite failure on relentless rejection", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await pushSyncStateRef(ioA);
    // A second outstanding write keeps the local ref ahead, so each retried push
    // is a real candidate the wrapped executor then rejects.
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A, { lastAttemptedCommit: "c".repeat(40) }));

    const realExec = makeGitExec(repoA);
    let pushCount = 0;
    const rejectingExec: GitExec = async (cmd, args) => {
      if (args[0] === "push") {
        pushCount++;
        throw new Error("! [rejected] (non-fast-forward)");
      }
      return realExec(cmd, args);
    };

    const outcome = await reconcileSyncStatePush(
      { exec: rejectingExec, execInput: makeGitExecInput(repoA), identity: IDENTITY },
      MACHINE_A,
    );

    expect(outcome.kind).toBe("failed");
    expect(pushCount).toBe(MAX_RECONCILE_ATTEMPTS);
  });
});
