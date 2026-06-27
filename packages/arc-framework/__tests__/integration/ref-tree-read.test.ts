/**
 * Integration tests for the discriminating tree-ref read
 * (`readTreeEntriesDiscriminating`) against a real temporary git repo.
 *
 * The reconcile path must tell a legitimately absent ref apart from a genuine git
 * read failure: collapsing both to empty — as the fail-open advisory reader does —
 * would let a transient errored read narrow a union to this machine's own key.
 * These tests run over git's actual messages: a never-created ref reads as
 * `absent`, a populated ref as `entries`, and a non-tree object as `error`, while
 * the existing fail-open readers stay empty / null on the same inputs.
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
  readTreeEntries,
  readTreeEntriesDiscriminating,
  readRefTip,
  hashBlob,
  type RefTreeWriteIO,
} from "../../src/lib/git/ref-tree.js";

const REF = "refs/arc/test/read";

describe("readTreeEntriesDiscriminating", () => {
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

  it("reports a genuinely absent ref distinctly from a present ref with entries", async () => {
    expect(await readTreeEntriesDiscriminating(io.exec, REF)).toEqual({ kind: "absent" });

    const blob = await hashBlob(io.execInput, "value");
    await writeTreeCommit(io, REF, new Map([["k", blob]]), "create", [], null);

    const result = await readTreeEntriesDiscriminating(io.exec, REF);
    expect(result.kind).toBe("entries");
    if (result.kind === "entries") {
      expect(result.entries.get("k")).toBe(blob);
    }
  });

  it("reports a genuine git read failure as an error, not collapsed to empty", async () => {
    // A blob object is not a tree, so `ls-tree` fails with a non-absent error —
    // a stand-in for any genuine read failure (corrupt store, unavailable repo).
    const blob = await hashBlob(io.execInput, "not a tree");

    const result = await readTreeEntriesDiscriminating(io.exec, blob);

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("leaves the fail-open advisory readers unchanged (still empty / null on error)", async () => {
    const blob = await hashBlob(io.execInput, "not a tree");

    // `readTreeEntries` still collapses both absent and errored reads to empty.
    expect(await readTreeEntries(io.exec, REF)).toEqual(new Map());
    expect(await readTreeEntries(io.exec, blob)).toEqual(new Map());
    // `readRefTip` still returns null for an absent ref.
    expect(await readRefTip(io.exec, REF)).toBeNull();
  });
});
