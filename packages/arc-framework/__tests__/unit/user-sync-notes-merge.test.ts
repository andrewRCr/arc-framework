/**
 * Unit tests for the pure concurrent-notes-push reconcile helpers. These build
 * the ref names and git args; the strategy choice (`cat_sort_uniq`) is the
 * lossless union that lets parallel-worktree notes survive a merge.
 */

import { describe, it, expect } from "vitest";

import {
  incomingFetchRefspec,
  incomingNotesRef,
  isCasRejectionError,
  isNonFastForwardError,
  isResolvedNoteValid,
  notesMergeArgs,
} from "../../src/lib/user-sync/index.js";

describe("notes-merge pure helpers", () => {
  it("notesMergeArgs selects the lossless cat_sort_uniq union strategy", () => {
    expect(notesMergeArgs("arc/user/andrew", "refs/notes/arc/user/andrew__incoming")).toEqual([
      "notes", "--ref", "arc/user/andrew",
      "merge", "-s", "cat_sort_uniq", "refs/notes/arc/user/andrew__incoming",
    ]);
  });

  it("incomingFetchRefspec force-fetches the remote ref into the temp tracking ref", () => {
    expect(incomingFetchRefspec("refs/notes/arc/user/andrew")).toBe(
      "+refs/notes/arc/user/andrew:refs/notes/arc/user/andrew__incoming",
    );
  });

  it("incomingNotesRef derives the temp ref from the full notes ref", () => {
    expect(incomingNotesRef("refs/notes/arc/user/andrew")).toBe(
      "refs/notes/arc/user/andrew__incoming",
    );
  });

  it("isNonFastForwardError matches rejection and non-fast-forward signals only", () => {
    expect(isNonFastForwardError(" ! [rejected]    refs/notes/x -> refs/notes/x")).toBe(true);
    expect(isNonFastForwardError("Updates were rejected (non-fast-forward)")).toBe(true);
    expect(isNonFastForwardError("fatal: 'origin' does not appear to be a git repository")).toBe(false);
  });

  it("isCasRejectionError matches update-ref old-value mismatch and create-collision only", () => {
    // The two shapes git's update-ref CAS check emits.
    expect(
      isCasRejectionError("cannot lock ref 'refs/arc/x': is at 51d75cd but expected 41e433c"),
    ).toBe(true);
    expect(isCasRejectionError("cannot lock ref 'refs/arc/x': reference already exists")).toBe(true);
    // A non-CAS git failure — and a push non-fast-forward — must not be read as a CAS rejection.
    expect(isCasRejectionError("fatal: update_ref failed: some unrelated git error")).toBe(false);
    expect(isCasRejectionError(" ! [rejected] (non-fast-forward)")).toBe(false);
  });

  describe("isResolvedNoteValid", () => {
    it("accepts a single well-formed manifest", () => {
      expect(isResolvedNoteValid(JSON.stringify({ version: 2, files: { "a.md": "x" } }))).toBe(true);
      expect(isResolvedNoteValid(JSON.stringify({ version: 1, files: {} }))).toBe(true);
    });

    it("rejects two manifests concatenated by a same-commit cat_sort_uniq merge", () => {
      const a = JSON.stringify({ version: 2, files: { "a.md": "from-worktree-a" } });
      const b = JSON.stringify({ version: 2, files: { "b.md": "from-worktree-b" } });
      expect(isResolvedNoteValid(`${a}\n${b}`)).toBe(false);
    });

    it("rejects JSON that is not a manifest shape", () => {
      expect(isResolvedNoteValid(JSON.stringify({ version: 9, files: {} }))).toBe(false);
      expect(isResolvedNoteValid(JSON.stringify({ version: 2 }))).toBe(false);
      expect(isResolvedNoteValid("not json at all")).toBe(false);
    });
  });
});
