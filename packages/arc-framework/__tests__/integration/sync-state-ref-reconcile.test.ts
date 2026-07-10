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
  incomingSyncStateRef,
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
const INTENT_A = "a".repeat(40);
const INTENT_B = "b".repeat(40);

/**
 * A reconcile-path exec that fails the incoming-tree read. The reconcile fetches into
 * a per-call-unique `__incoming` ref and reads each tree by its resolved tip SHA, so
 * this captures the incoming tip from that ref's rev-parse, then throws `errorMessage`
 * on the `ls-tree` of exactly that tip — isolating the incoming read from the local
 * one without needing to precompute the (unique) ref name.
 */
function makeIncomingReadFailExec(realExec: GitExec, errorMessage: string): GitExec {
  let incomingTip: string | null = null;
  return async (cmd, args) => {
    if (args[0] === "rev-parse" && typeof args[2] === "string" && args[2].includes("__incoming")) {
      const result = await realExec(cmd, args);
      incomingTip = result.stdout.trim() || null;
      return result;
    }
    if (
      args[0] === "ls-tree" && !args.includes("-r")
      && incomingTip !== null && args[args.length - 1] === incomingTip
    ) {
      throw new Error(errorMessage);
    }
    return realExec(cmd, args);
  };
}

function markerFor(machineId: string, overrides: Partial<SyncStateMarker> = {}): SyncStateMarker {
  const intent = machineId === MACHINE_A ? INTENT_A : INTENT_B;
  return {
    version: 1,
    machineId,
    lastAttemptedCommit: "a".repeat(40),
    attemptTimestamp: "2026-06-25T12:00:00.000Z",
    intent,
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

/** Entry keys present on the remote sync-state ref, read from a clone. */
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

    expect(await reconcileSyncStatePush(ioA, INTENT_A)).toEqual({ kind: "pushed" });
    expect(await remoteKeys(repoA)).toEqual([INTENT_A]);
  });

  it("is a no-op when there is no local ref to push", async () => {
    expect(await reconcileSyncStatePush(ioA, INTENT_A)).toEqual({ kind: "noop" });
  });

  it("unions both machines' entries over a non-fast-forward push", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await reconcileSyncStatePush(ioA, INTENT_A);

    // repoB never fetched the ref, so its write forks a divergent root.
    await writeSyncStateMarker(ioB, markerFor(MACHINE_B));
    expect(await reconcileSyncStatePush(ioB, INTENT_B)).toEqual({ kind: "reconciled" });

    expect(await remoteKeys(repoB)).toEqual([INTENT_A, INTENT_B]);
    // Both markers survive the union — neither machine's entry is lost.
    expect((await readSyncStateMarker(ioB, INTENT_A))?.machineId).toBe(MACHINE_A);
    expect((await readSyncStateMarker(ioB, INTENT_B))?.machineId).toBe(MACHINE_B);
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
      INTENT_A,
    );

    expect(outcome.kind).toBe("failed");
    // MAX_RECONCILE_ATTEMPTS reconciles, each followed by a retry push, plus the
    // initial push — so the bound is one more push than reconcile.
    expect(pushCount).toBe(MAX_RECONCILE_ATTEMPTS + 1);
  });

  it("pushes the freshly-merged ref after the final reconcile rather than bailing", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await pushSyncStateRef(ioA);
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A, { lastAttemptedCommit: "c".repeat(40) }));

    const realExec = makeGitExec(repoA);
    let pushCount = 0;
    // Reject the first MAX_RECONCILE_ATTEMPTS pushes (each drives a reconcile),
    // then let the final push through — the loop must attempt that post-reconcile
    // push instead of returning failed after the last reconcile.
    const settleOnLastExec: GitExec = async (cmd, args) => {
      if (args[0] === "push") {
        pushCount++;
        if (pushCount <= MAX_RECONCILE_ATTEMPTS) throw new Error("! [rejected] (non-fast-forward)");
      }
      return realExec(cmd, args);
    };

    const outcome = await reconcileSyncStatePush(
      { exec: settleOnLastExec, execInput: makeGitExecInput(repoA), identity: IDENTITY },
      INTENT_A,
    );

    expect(outcome.kind).toBe("reconciled");
    expect(pushCount).toBe(MAX_RECONCILE_ATTEMPTS + 1);
  });

  it("normalizes a reconcile-step failure into a failed outcome rather than throwing", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await pushSyncStateRef(ioA);
    // Keep the local ref ahead so the first push is a genuine non-ff candidate.
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A, { lastAttemptedCommit: "c".repeat(40) }));

    const realExec = makeGitExec(repoA);
    // Push rejects non-ff (entering the reconcile path); the reconcile's fetch
    // then throws. The loop must catch it and surface `failed` through the
    // outcome union, never let it escape as a rejection.
    const failingReconcileExec: GitExec = async (cmd, args) => {
      if (args[0] === "push") throw new Error("! [rejected] (non-fast-forward)");
      if (args[0] === "fetch") throw new Error("fatal: simulated reconcile failure");
      return realExec(cmd, args);
    };

    const outcome = await reconcileSyncStatePush(
      { exec: failingReconcileExec, execInput: makeGitExecInput(repoA), identity: IDENTITY },
      INTENT_A,
    );

    expect(outcome.kind).toBe("failed");
  });

  it("aborts on a genuine post-fetch read error instead of writing a tree narrowed to this machine", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await reconcileSyncStatePush(ioA, INTENT_A);

    // repoB writes its own marker over a divergent root — its push is a genuine
    // non-fast-forward that drives the reconcile.
    await writeSyncStateMarker(ioB, markerFor(MACHINE_B));

    const realExec = makeGitExec(repoB);
    // Push rejects non-ff (entering reconcile); the fetch succeeds, but the post-fetch
    // read of the incoming tree then fails for a reason other than an absent ref — so
    // the reconcile must abort rather than union a tree that drops machine A's entry.
    const failingReadExec = makeIncomingReadFailExec(realExec, "fatal: unable to read tree object (simulated)");

    const outcome = await reconcileSyncStatePush(
      { exec: failingReadExec, execInput: makeGitExecInput(repoB), identity: IDENTITY },
      INTENT_B,
    );

    expect(outcome.kind).toBe("failed");
    // Machine A's entry survives on the remote — no narrowed tree was pushed.
    expect(await remoteKeys(repoB)).toEqual([INTENT_A]);
  });

  it("treats a legitimately-absent post-fetch read as empty and unions rather than aborting", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await reconcileSyncStatePush(ioA, INTENT_A);

    await writeSyncStateMarker(ioB, markerFor(MACHINE_B));

    const realExec = makeGitExec(repoB);
    // The incoming tree reads as a legitimately absent ref (git's "Not a valid object
    // name"). Absence is not a failure: the reconcile unions it as empty and completes
    // rather than surfacing a failed abort. This isolates the absent branch from the
    // errored branch above. (The remote union legitimately omits machine A here — the
    // synthetic absent read contributes nothing; the union-preservation guarantee is
    // covered by the errored-read test above, which leaves A intact.)
    const absentIncomingExec = makeIncomingReadFailExec(realExec, "fatal: Not a valid object name (simulated)");

    const outcome = await reconcileSyncStatePush(
      { exec: absentIncomingExec, execInput: makeGitExecInput(repoB), identity: IDENTITY },
      INTENT_B,
    );

    expect(outcome.kind).toBe("reconciled");
  });

  it("fetches into a per-reconcile-unique incoming ref and cleans it up", async () => {
    await writeSyncStateMarker(ioA, markerFor(MACHINE_A));
    await reconcileSyncStatePush(ioA, INTENT_A);
    await writeSyncStateMarker(ioB, markerFor(MACHINE_B));

    const realExec = makeGitExec(repoB);
    const fetchedRefs: string[] = [];
    const spyExec: GitExec = async (cmd, args) => {
      if (args[0] === "fetch") {
        // refspec is the last arg, `+<ref>:<incoming>`.
        const incoming = String(args[args.length - 1]).split(":")[1];
        if (incoming) fetchedRefs.push(incoming);
      }
      return realExec(cmd, args);
    };

    const outcome = await reconcileSyncStatePush(
      { exec: spyExec, execInput: makeGitExecInput(repoB), identity: IDENTITY },
      INTENT_B,
    );

    expect(outcome.kind).toBe("reconciled");
    // The tracking ref is per-reconcile-unique — the shared base plus a token suffix —
    // so two concurrent reconciles never fetch into (or delete) the same ref.
    expect(fetchedRefs).toHaveLength(1);
    const incoming = fetchedRefs[0] ?? "";
    expect(incoming.startsWith(`${incomingSyncStateRef(REF)}__`)).toBe(true);
    expect(incoming).not.toBe(incomingSyncStateRef(REF));
    // And it is cleaned up — no incoming ref leaks afterward.
    const { stdout } = await realExec("git", ["for-each-ref", "--format=%(refname)", `${incomingSyncStateRef(REF)}*`]);
    expect(stdout.trim()).toBe("");
  });
});
