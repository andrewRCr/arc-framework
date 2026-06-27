/**
 * Integration tests for the bounded compare-and-swap retry frame
 * (`writeTreeWithCasRetry`) around the shared tree-commit chokepoint.
 *
 * The frame's `mutate` closure runs in exactly the window between the frame's
 * tip/tree read and its write, so it doubles as a deterministic interleave seam:
 * a closure that advances the ref out-of-band forces the CAS rejection the frame
 * must catch, re-read, and retry. A relentless racer drives the bound; a fake IO
 * injects a non-CAS git error to assert it surfaces immediately, never retried.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";
import {
  writeTreeCommit,
  readRefTip,
  readTreeEntries,
  hashBlob,
  MAX_RECONCILE_ATTEMPTS,
  type RefTreeWriteIO,
} from "../../src/lib/git/ref-tree.js";
import { writeTreeWithCasRetry } from "../../src/lib/user-sync/cas-retry.js";
import type { GitExec, GitExecInput } from "../../src/lib/git/exec.js";

const REF = "refs/arc/test/cas-retry";

describe("writeTreeWithCasRetry", () => {
  let dir: string;
  let io: RefTreeWriteIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    io = { exec: makeGitExec(dir), execInput: makeGitExecInput(dir) };
  });

  afterEach(async () => {
    try {
      await cleanupTempDir(dir);
    } catch {
      // ignored
    }
  });

  it("re-reads tip+tree and rebuilds the mutation on a CAS rejection, then retries successfully", async () => {
    const siblingBlob = await hashBlob(io.execInput, "sibling");
    await writeTreeCommit(io, REF, new Map([["sibling", siblingBlob]]), "seed", [], null);

    const oursBlob = await hashBlob(io.execInput, "ours");
    let raced = false;
    const outcome = await writeTreeWithCasRetry(io, REF, "write ours", async (entries) => {
      if (!raced) {
        raced = true;
        // A same-machine sibling advances the ref between our read and our write.
        const tip = await readRefTip(io.exec, REF);
        const concurrent = new Map(entries);
        concurrent.set("concurrent", await hashBlob(io.execInput, "concurrent"));
        await writeTreeCommit(io, REF, concurrent, "concurrent", tip ? [tip] : [], tip);
      }
      entries.set("ours", oursBlob);
      return entries;
    });

    expect(outcome.kind).toBe("written");
    // The retry re-read the concurrent writer's entry and rebuilt on the fresh
    // tree — neither the sibling's, the racer's, nor our entry is dropped.
    expect([...(await readTreeEntries(io.exec, REF)).keys()].sort()).toEqual([
      "concurrent",
      "ours",
      "sibling",
    ]);
  });

  it("surfaces a non-CAS git error immediately without retrying", async () => {
    let updateRefCalls = 0;
    const fakeExec: GitExec = async (_cmd, args) => {
      const sub = args[0];
      if (sub === "update-ref") {
        updateRefCalls++;
        throw new Error("fatal: update_ref failed for ref: some unrelated git error");
      }
      if (sub === "commit-tree") return { stdout: "c".repeat(40) };
      // rev-parse (tip) / ls-tree (tree) both read as absent/empty.
      return { stdout: "" };
    };
    const fakeExecInput: GitExecInput = async () => "t".repeat(40);
    const fakeIo: RefTreeWriteIO = { exec: fakeExec, execInput: fakeExecInput };

    const outcome = await writeTreeWithCasRetry(fakeIo, REF, "msg", (entries) => entries);

    expect(outcome.kind).toBe("failed");
    expect(updateRefCalls).toBe(1);
    // The original non-CAS error is preserved, not collapsed into the generic
    // exhaustion failure — the frame surfaces a typed, distinguishable outcome.
    if (outcome.kind === "failed") {
      expect(outcome.error.message).toContain("some unrelated git error");
    }
  });

  it("exhausts at MAX_RECONCILE_ATTEMPTS against a relentless racer and returns a typed failure", async () => {
    await writeTreeCommit(io, REF, new Map([["seed", await hashBlob(io.execInput, "seed")]]), "seed", [], null);

    let races = 0;
    const oursBlob = await hashBlob(io.execInput, "ours");
    const outcome = await writeTreeWithCasRetry(io, REF, "write ours", async (entries) => {
      // Advance the ref on every attempt — our write can never win the CAS.
      races++;
      const tip = await readRefTip(io.exec, REF);
      const next = new Map(entries);
      next.set(`racer-${races}`, await hashBlob(io.execInput, `racer-${races}`));
      await writeTreeCommit(io, REF, next, `race ${races}`, tip ? [tip] : [], tip);
      entries.set("ours", oursBlob);
      return entries;
    });

    expect(outcome.kind).toBe("failed");
    expect(races).toBe(MAX_RECONCILE_ATTEMPTS);
    expect((await readTreeEntries(io.exec, REF)).has("ours")).toBe(false);
    // Exhaustion surfaces its own typed failure, distinct from a non-CAS error.
    if (outcome.kind === "failed") {
      expect(outcome.error.message).toContain("exceeded retry attempts");
    }
  });
});
