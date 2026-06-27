/**
 * Integration tests for the compare-and-swap guard on the shared tree-commit
 * chokepoint (`writeTreeCommit`).
 *
 * Runs against a real temporary git repo so the CAS exercises git's actual
 * `update-ref <ref> <new> <old>` old-value check: a write whose expected old tip
 * still matches canonical advances the ref; a write whose expected old tip went
 * stale (the ref moved underneath) is rejected by git rather than clobbering the
 * canonical tip; and the create-from-absent form (`<old>` empty) creates the ref
 * but fails if it already exists.
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
  type RefTreeWriteIO,
} from "../../src/lib/git/ref-tree.js";
import { isCasRejectionError } from "../../src/lib/user-sync/notes-merge.js";

const REF = "refs/arc/test/cas";

/** Run a write expected to reject, returning its error so the rejection shape can be asserted. */
async function captureRejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
  throw new Error("expected the write to reject, but it resolved");
}

describe("writeTreeCommit compare-and-swap", () => {
  let dir: string;
  let io: RefTreeWriteIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    // An orphan state-ref needs no history, but a HEAD keeps the repo normal.
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

  /** A single-entry tree keyed `k` carrying `value`. */
  async function entriesFor(key: string, value: string): Promise<Map<string, string>> {
    return new Map([[key, await hashBlob(io.execInput, value)]]);
  }

  it("advances the ref when the expected old tip still matches canonical", async () => {
    await writeTreeCommit(io, REF, await entriesFor("k", "first"), "create", [], null);
    const tip = await readRefTip(io.exec, REF);
    expect(tip).not.toBeNull();

    const next = await writeTreeCommit(io, REF, await entriesFor("k", "second"), "update", [tip!], tip);

    expect(await readRefTip(io.exec, REF)).toBe(next);
    expect(next).not.toBe(tip);
    const blobSha = (await readTreeEntries(io.exec, REF)).get("k");
    expect(blobSha).toBe(await hashBlob(io.execInput, "second"));
  });

  it("rejects a write whose expected old tip went stale, leaving canonical untouched", async () => {
    await writeTreeCommit(io, REF, await entriesFor("k", "first"), "create", [], null);
    const stale = await readRefTip(io.exec, REF);

    // A concurrent writer advances the ref underneath us, CAS-correct.
    const current = await writeTreeCommit(io, REF, await entriesFor("k", "second"), "concurrent", [stale!], stale);

    // Our write still expects `stale` — git's old-value check must reject it, and the
    // rejection must be the CAS shape the retry frame keys on, not just any throw.
    const rejection = await captureRejection(
      writeTreeCommit(io, REF, await entriesFor("k", "clobber"), "loser", [stale!], stale),
    );
    expect(isCasRejectionError(rejection.message)).toBe(true);

    // Canonical is unchanged — the concurrent writer's commit and content survive.
    expect(await readRefTip(io.exec, REF)).toBe(current);
    expect((await readTreeEntries(io.exec, REF)).get("k")).toBe(await hashBlob(io.execInput, "second"));
  });

  it("creates an absent ref with the zero-old-value form, but fails if it already exists", async () => {
    const created = await writeTreeCommit(io, REF, await entriesFor("k", "first"), "create", [], null);
    expect(await readRefTip(io.exec, REF)).toBe(created);

    // A second create-from-absent (expected old tip null → empty old value) must
    // fail because the ref now exists, rather than overwriting it — and reject with
    // the CAS shape, not just any throw.
    const rejection = await captureRejection(
      writeTreeCommit(io, REF, await entriesFor("k", "again"), "recreate", [], null),
    );
    expect(isCasRejectionError(rejection.message)).toBe(true);

    expect(await readRefTip(io.exec, REF)).toBe(created);
  });
});
