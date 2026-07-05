/**
 * Unit tests for the pure keyed sync-state entry union-merge — disjoint union,
 * the writer's current-key re-write winning without collision, and the
 * current-key deletion surviving a remote that still carries the entry.
 * Independent of any git remote.
 */

import { describe, it, expect } from "vitest";

import { mergeSyncStateEntries } from "../../src/lib/user-sync/sync-state-merge.js";

/** A 40-char hex blob sha from a short seed. */
const sha = (seed: string): string => seed.padEnd(40, "0");

const A = "machine-a";
const B = "machine-b";

describe("mergeSyncStateEntries", () => {
  it("unions two disjoint machine entries into a set containing both", () => {
    const local = new Map([[A, sha("a1")]]);
    const remote = new Map([[B, sha("b1")]]);

    expect(mergeSyncStateEntries(local, remote, A)).toEqual(
      new Map([[A, sha("a1")], [B, sha("b1")]]),
    );
  });

  it("replaces the writer's own re-written key and leaves the sibling untouched", () => {
    const local = new Map([[A, sha("a2")], [B, sha("b1")]]);
    const remote = new Map([[A, sha("a1")], [B, sha("b1")]]);

    expect(mergeSyncStateEntries(local, remote, A)).toEqual(
      new Map([[A, sha("a2")], [B, sha("b1")]]),
    );
  });

  it("removes only the writer's own deleted key from the union", () => {
    const local = new Map([[B, sha("b1")]]); // machine A cleared its own key
    const remote = new Map([[A, sha("a1")], [B, sha("b1")]]);

    expect(mergeSyncStateEntries(local, remote, A)).toEqual(new Map([[B, sha("b1")]]));
  });
});
