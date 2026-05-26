/**
 * Unit tests for the pure concurrent-notes-push reconcile helpers. These build
 * the ref names and git args; the strategy choice (`cat_sort_uniq`) is the
 * lossless union that lets parallel-worktree notes survive a merge.
 */

import { describe, it, expect } from "vitest";

import {
  incomingFetchRefspec,
  incomingNotesRef,
  isNonFastForwardError,
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
});
