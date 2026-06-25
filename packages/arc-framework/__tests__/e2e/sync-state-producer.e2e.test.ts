/**
 * Multi-machine producer-lifecycle E2E for the partial-push sync-state marker.
 *
 * Drives the shipped CLI across two clones of one bare origin, under one
 * identity. A bare-origin `update` hook rejects only the user-notes ref, so a
 * real `arc sync` produces a partial push (worktree + sync-state ref land, the
 * notes leg fails) — the exact cross-machine condition the marker exists to make
 * visible. Assertions read the git refs directly (the sibling B-side rendering
 * is a separate work unit): the sync-state ref carries the producer's
 * machine-keyed entry, the recorded intent is live while origin's notes lag, and
 * it self-invalidates (fulfilled) once the notes land. A second clone proves the
 * per-machine union-merge.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";
import { runCli } from "../helpers/run-cli.js";
import { runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;
const SYNC_STATE_REF = `refs/arc/user/${IDENTITY}/sync-state`;

/** Run a git command in `cwd`, returning trimmed stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Resolve a ref in `repo`, or `null` when it does not exist. */
async function refTip(repo: string, ref: string): Promise<string | null> {
  try {
    return await git(repo, ["rev-parse", "--verify", ref]);
  } catch {
    return null;
  }
}

/** Machine-key entry names on the origin's sync-state ref tree (sorted). */
async function syncStateKeys(origin: string): Promise<string[]> {
  const tip = await refTip(origin, SYNC_STATE_REF);
  if (tip === null) return [];
  const out = await git(origin, ["ls-tree", "--name-only", `${tip}^{tree}`]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

/** Read and parse a machine's marker entry from the origin's sync-state ref. */
async function readMarker(
  origin: string,
  machineId: string,
): Promise<{ machineId: string; lastAttemptedCommit: string; intent: string }> {
  const tip = await refTip(origin, SYNC_STATE_REF);
  if (tip === null) throw new Error("sync-state ref absent on origin");
  const blob = await git(origin, ["cat-file", "blob", `${tip}:${machineId}`]);
  return JSON.parse(blob) as { machineId: string; lastAttemptedCommit: string; intent: string };
}

/** This clone's persisted machine-id (assigned on the first marker publish). */
async function machineId(clone: string): Promise<string> {
  const path = join(clone, ".arc", "user", IDENTITY, ".internal", ".sync-state.json");
  const record = JSON.parse(await readFile(path, "utf-8")) as { machineId?: string };
  if (!record.machineId) throw new Error("machine-id not persisted");
  return record.machineId;
}

/**
 * Install a bare-origin `update` hook that rejects pushes to the user-notes
 * ref and accepts everything else — forcing the notes leg of a paired push to
 * fail while the worktree and sync-state pushes land.
 */
async function rejectNotesPushes(origin: string): Promise<void> {
  const hook = join(origin, "hooks", "update");
  await writeFile(
    hook,
    "#!/bin/sh\ncase \"$1\" in\n  refs/notes/arc/user/*) echo 'notes push rejected by test hook' >&2; exit 1 ;;\nesac\nexit 0\n",
    "utf-8",
  );
  await chmod(hook, 0o755);
}

/** Remove the notes-rejecting hook so a subsequent notes push lands. */
async function allowNotesPushes(origin: string): Promise<void> {
  await writeFile(join(origin, "hooks", "update"), "#!/bin/sh\nexit 0\n", "utf-8");
}

/**
 * Install ARC in a clone via the built CLI, set `push_interlock: on-sync` so a
 * runtime sync runs the paired worktree+notes push, seed a SESSION-NOTES so the
 * notes leg has content to push, and commit the install.
 */
async function installArcWithNotes(clone: string): Promise<void> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], clone);
  if (init.exitCode !== 0) {
    throw new Error(`arc init failed (exit ${init.exitCode}): ${init.stderr}`);
  }
  await git(clone, ["config", "--local", "arc.pushInterlock", "on-sync"]);
  await writeFile(
    join(clone, ".arc", "user", IDENTITY, "SESSION-NOTES.md"),
    "# producer notes\n",
    "utf-8",
  );
  await git(clone, ["add", "."]);
  await git(clone, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "install arc"]);
}

describe("partial-push sync-state marker — multi-machine producer lifecycle", () => {
  let harness: MultiClone;

  beforeEach(async () => {
    harness = await setupMultiClone({
      cloneA: { config: { "arc.identity": IDENTITY } },
      cloneB: { config: { "arc.identity": IDENTITY } },
    });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("A partial-pushes → the sync-state ref carries A's live entry", async () => {
    await installArcWithNotes(harness.cloneA);
    await rejectNotesPushes(harness.origin);

    const sync = await runCli(["sync", "--json"], { cwd: harness.cloneA, timeout: 20_000 });
    // Worst-outcome: the notes leg failed, so the paired push exits non-zero.
    expect(sync.exitCode).toBe(1);

    // The worktree push landed; the notes push did not.
    expect(await refTip(harness.origin, "refs/heads/main")).not.toBeNull();
    expect(await refTip(harness.origin, NOTES_REF)).toBeNull();

    // The sync-state ref carries exactly A's machine-keyed entry.
    const idA = await machineId(harness.cloneA);
    expect(await syncStateKeys(harness.origin)).toEqual([idA]);

    // The entry records A's outstanding intent (its local notes-ref tip).
    const localNotesTip = await refTip(harness.cloneA, NOTES_REF);
    const marker = await readMarker(harness.origin, idA);
    expect(marker.intent).toBe(localNotesTip);

    // Liveness is "live": origin's notes ref has not reached the recorded intent
    // (here it does not exist at all), so the outstanding intent stands.
    const originNotesTip = await refTip(harness.origin, NOTES_REF);
    expect(originNotesTip).not.toBe(marker.intent);
  }, 30_000);

  it("A's notes later land → the entry self-invalidates (fulfilled)", async () => {
    await installArcWithNotes(harness.cloneA);
    await rejectNotesPushes(harness.origin);

    const partial = await runCli(["sync", "--json"], { cwd: harness.cloneA, timeout: 20_000 });
    expect(partial.exitCode).toBe(1);
    expect(await refTip(harness.origin, NOTES_REF)).toBeNull();

    // The notes ref becomes reachable; a second sync lands the outstanding notes.
    await allowNotesPushes(harness.origin);
    const recovered = await runCli(["sync", "--json"], { cwd: harness.cloneA, timeout: 20_000 });
    expect(recovered.exitCode).toBe(0);

    // Origin's notes ref now reaches the recorded intent → fulfilled: the same
    // comparison `evaluateMarkerLiveness` makes, here at the git level.
    const idA = await machineId(harness.cloneA);
    const marker = await readMarker(harness.origin, idA);
    expect(await refTip(harness.origin, NOTES_REF)).toBe(marker.intent);
  }, 30_000);

  it("two machines hold outstanding intents → per-machine union-merge, neither clobbers", async () => {
    await installArcWithNotes(harness.cloneA);
    await rejectNotesPushes(harness.origin);
    const a = await runCli(["sync", "--json"], { cwd: harness.cloneA, timeout: 20_000 });
    expect(a.exitCode).toBe(1);

    // Clone B fast-forwards onto A's pushed install, then partial-pushes its own
    // intent — its marker reconciles against A's entry rather than replacing it.
    await git(harness.cloneB, ["pull", "--ff-only", "origin", "main"]);
    await git(harness.cloneB, ["config", "--local", "arc.pushInterlock", "on-sync"]);
    // B's per-machine user dir is gitignored, so the pull from A doesn't carry
    // it — B creates its own before seeding its notes.
    await mkdir(join(harness.cloneB, ".arc", "user", IDENTITY), { recursive: true });
    await writeFile(
      join(harness.cloneB, ".arc", "user", IDENTITY, "SESSION-NOTES.md"),
      "# clone B notes\n",
      "utf-8",
    );
    const b = await runCli(["sync", "--json"], { cwd: harness.cloneB, timeout: 20_000 });
    expect(b.exitCode).toBe(1);

    // Both machine keys coexist on the ref — the union-merge kept A's entry.
    const idA = await machineId(harness.cloneA);
    const idB = await machineId(harness.cloneB);
    expect(idA).not.toBe(idB);
    expect(await syncStateKeys(harness.origin)).toEqual([idA, idB].sort());
  }, 30_000);
});
