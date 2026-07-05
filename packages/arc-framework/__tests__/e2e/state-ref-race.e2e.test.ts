/**
 * Bounded true-race e2e smokes — the empirical backstop for the four
 * same-machine write-safety guards.
 *
 * The deterministic interleave tests (unit/integration tier) force one specific
 * read→write ordering through an injected seam and are the primary, zero-flake
 * assertions. These smokes are the complement the spec calls for: a small fixed
 * number of rounds spawning *real* concurrent processes (`race-worker.ts`) that
 * race the genuine guard primitives against one temp git repo, asserting both
 * writes land — no silent drop, and a converged machine-id. Bounded rounds keep
 * the suite fast and flake-free while still exercising true OS-level contention
 * the in-process tests cannot.
 *
 * Per-guard coverage:
 *   - sync-state ref (D1): two entry-keyed writes both land in the ref tree.
 *   - errand ref (D1): two errand records both land in the ref tree.
 *   - user-notes (D4): two notes for two commits both land under the lock.
 *   - machine-id (D3): two first-callers converge on a single id.
 */

import { execFile } from "node:child_process";
import { readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect } from "vitest";

import { cleanupTempDir, createTempRepo } from "./helpers.js";
import { runRound, type WorkerResult } from "./true-race.js";

const execFileAsync = promisify(execFile);

/** Rounds per guard — bounded so the suite stays fast, repeated to catch flakiness. */
const ROUNDS = 5;

/** Workers per round (the two same-machine racers). */
const RACERS = 2;

const IDENTITY = "test-user";
const SYNC_STATE_REF = `refs/arc/user/${IDENTITY}/sync-state`;
const ERRANDS_REF = `refs/arc/user/${IDENTITY}/errands`;
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

/** Per-it budget — generous for cold `tsx` start-up across rounds × racers. */
const SMOKE_TIMEOUT_MS = 60_000;

/** Assert every worker in a round exited cleanly, surfacing stderr on failure. */
function expectAllOk(results: WorkerResult[], round: number): void {
  results.forEach((res, i) => {
    expect(res.exitCode, `round ${round} worker ${i} failed:\n${res.stderr}`).toBe(0);
  });
}

/** Resolve a ref in `repo`, or `null` when it does not exist. */
async function refTip(repo: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", ref], { cwd: repo });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Whether a filesystem path exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** The tree keys (entry names) held in a ref's commit, sorted; empty when absent. */
async function refTreeKeys(repo: string, ref: string): Promise<string[]> {
  const tip = await refTip(repo, ref);
  if (tip === null) return [];
  const { stdout } = await execFileAsync("git", ["ls-tree", "--name-only", `${tip}^{tree}`], { cwd: repo });
  return stdout.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

/** Show a note's content for `commit`, or `null` when no note is attached. */
async function noteShow(repo: string, commit: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["notes", "--ref", NOTES_REF, "show", commit], { cwd: repo });
    return stdout;
  } catch {
    return null;
  }
}

/** Create an empty commit (hooks bypassed) and return its hash. */
async function emptyCommit(repo: string, message: string): Promise<string> {
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", message], { cwd: repo });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
  return stdout.trim();
}

describe("true-race smokes — same-machine write-safety guards", () => {
  it("sync-state ref (D1): two racing entry-keyed writes both land", async () => {
    const dir = await createTempRepo("arc-race-syncstate-");
    try {
      const expectedKeys: string[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        const keyA = `machine-${round}-a`;
        const keyB = `machine-${round}-b`;
        const results = await runRound([
          ["sync-state", dir, IDENTITY, keyA],
          ["sync-state", dir, IDENTITY, keyB],
        ]);
        expectAllOk(results, round);
        expectedKeys.push(keyA, keyB);
        // Exact cumulative match: every key from this and all prior rounds is still
        // present, so a regression that clobbered an earlier round's entry is caught
        // — not just that the current round's two writes landed.
        const keys = await refTreeKeys(dir, SYNC_STATE_REF);
        expect(keys, `round ${round}`).toEqual([...expectedKeys].sort());
      }
    } finally {
      await cleanupTempDir(dir);
    }
  }, SMOKE_TIMEOUT_MS);

  it("errand ref (D1): two racing record writes both land", async () => {
    const dir = await createTempRepo("arc-race-errand-");
    try {
      const expectedSlugs: string[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        const slugA = `errand-${round}-a`;
        const slugB = `errand-${round}-b`;
        const results = await runRound([
          ["errand", dir, IDENTITY, slugA],
          ["errand", dir, IDENTITY, slugB],
        ]);
        expectAllOk(results, round);
        expectedSlugs.push(slugA, slugB);
        // Exact cumulative match — an earlier round's record clobbered by a later
        // write would fail here, where an arrayContaining check would not.
        const keys = await refTreeKeys(dir, ERRANDS_REF);
        expect(keys, `round ${round}`).toEqual([...expectedSlugs].sort());
      }
    } finally {
      await cleanupTempDir(dir);
    }
  }, SMOKE_TIMEOUT_MS);

  it("user-notes (D4): two racing note writes both land under the lock", async () => {
    const dir = await createTempRepo("arc-race-notes-");
    try {
      const noted: string[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        const commitA = await emptyCommit(dir, `note-round-${round}-a`);
        const commitB = await emptyCommit(dir, `note-round-${round}-b`);
        const results = await runRound([
          ["notes", dir, IDENTITY, commitA],
          ["notes", dir, IDENTITY, commitB],
        ]);
        expectAllOk(results, round);
        noted.push(commitA, commitB);
        // Every note ever written still resolves — the lock kept the unguarded
        // `git notes add` RMW from collapsing concurrent writes, and no later round
        // silently dropped an earlier round's note.
        for (const commit of noted) {
          expect(await noteShow(dir, commit), `round ${round} note ${commit}`).toContain(`note for ${commit}`);
        }
      }
    } finally {
      await cleanupTempDir(dir);
    }
  }, SMOKE_TIMEOUT_MS);

  it("user-notes (D4): sibling worktrees contend through one common-dir lock", async () => {
    const dir = await createTempRepo("arc-race-notes-worktrees-");
    const worktree = join(dirname(dir), `${basename(dir)}-sibling`);
    try {
      await emptyCommit(dir, "base");
      await execFileAsync("git", ["worktree", "add", "-b", "sibling", worktree, "HEAD"], { cwd: dir });

      const noted: string[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        const commitA = await emptyCommit(dir, `worktree-note-round-${round}-a`);
        const commitB = await emptyCommit(worktree, `worktree-note-round-${round}-b`);
        const results = await runRound([
          ["notes", dir, IDENTITY, commitA],
          ["notes", worktree, IDENTITY, commitB],
        ]);
        expectAllOk(results, round);
        noted.push(commitA, commitB);
        for (const commit of noted) {
          expect(await noteShow(dir, commit), `round ${round} note ${commit}`).toContain(`note for ${commit}`);
        }
      }
    } finally {
      await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: dir }).catch(() => {});
      await cleanupTempDir(dir);
      await rm(worktree, { recursive: true, force: true });
    }
  }, SMOKE_TIMEOUT_MS);

  it("machine-id (D3): two racing first-callers converge on one id", async () => {
    const dir = await createTempRepo("arc-race-machineid-");
    try {
      for (let round = 0; round < ROUNDS; round++) {
        // A fresh identity per round means a fresh `.machine-id` — every round
        // is a genuine first-call race, not an idempotent re-read.
        const identity = `mid-${round}`;
        const results = await runRound(
          Array.from({ length: RACERS }, () => ["machine-id", dir, identity]),
        );
        expectAllOk(results, round);

        const ids = results.map((res) => (JSON.parse(res.stdout.trim()) as { id: string }).id);
        expect(ids[0], `round ${round} id present`).toBeTruthy();
        expect(new Set(ids).size, `round ${round} converged`).toBe(1);

        const persisted = (
          await readFile(join(dir, ".git", "arc", "user", identity, ".internal", ".machine-id"), "utf-8")
        ).trim();
        expect(persisted, `round ${round} persisted`).toBe(ids[0]);
      }
    } finally {
      await cleanupTempDir(dir);
    }
  }, SMOKE_TIMEOUT_MS);

  it("machine-id (D3): sibling worktrees converge on one common-dir id without checkout pollution", async () => {
    const dir = await createTempRepo("arc-race-machineid-worktrees-");
    const worktree = join(dirname(dir), `${basename(dir)}-sibling`);
    try {
      await emptyCommit(dir, "base");
      await execFileAsync("git", ["worktree", "add", "-b", "sibling", worktree, "HEAD"], { cwd: dir });
      const identity = "shared-mid";

      const results = await runRound([
        ["machine-id", dir, identity],
        ["machine-id", worktree, identity],
      ]);
      expectAllOk(results, 0);

      const ids = results.map((res) => (JSON.parse(res.stdout.trim()) as { id: string }).id);
      expect(ids[0]).toBeTruthy();
      expect(new Set(ids).size).toBe(1);
      const commonStore = join(dir, ".git", "arc", "user", identity, ".internal", ".machine-id");
      expect((await readFile(commonStore, "utf-8")).trim()).toBe(ids[0]);
      expect(await exists(join(dir, ".arc", "user", identity, ".internal", ".machine-id"))).toBe(false);
      expect(await exists(join(worktree, ".arc", "user", identity, ".internal", ".machine-id"))).toBe(false);
    } finally {
      await execFileAsync("git", ["worktree", "remove", "--force", worktree], { cwd: dir }).catch(() => {});
      await cleanupTempDir(dir);
      await rm(worktree, { recursive: true, force: true });
    }
  }, SMOKE_TIMEOUT_MS);
});
