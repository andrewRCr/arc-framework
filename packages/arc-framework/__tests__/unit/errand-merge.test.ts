/**
 * Unit tests for the pure per-slug errand tree-merge — distinct-slug union,
 * byte-identical idempotence (equal blob sha), and divergent same-slug
 * collision — independent of any git remote.
 */

import { describe, it, expect } from "vitest";

import { mergeErrandTrees } from "../../src/lib/errand/index.js";

/** A 40-char hex blob sha from a short seed. */
const sha = (seed: string): string => seed.padEnd(40, "0");

describe("mergeErrandTrees", () => {
  it("unions distinct slugs from each side", () => {
    const local = new Map([["a", sha("a1")]]);
    const remote = new Map([["b", sha("b1")]]);

    const result = mergeErrandTrees(local, remote);

    expect(result).toEqual({
      kind: "merged",
      entries: new Map([["a", sha("a1")], ["b", sha("b1")]]),
    });
  });

  it("keeps a byte-identical same-slug entry once (idempotent)", () => {
    const local = new Map([["x", sha("xx")]]);
    const remote = new Map([["x", sha("xx")]]);

    const result = mergeErrandTrees(local, remote);

    expect(result).toEqual({ kind: "merged", entries: new Map([["x", sha("xx")]]) });
  });

  it("reports a divergent same-slug entry as a collision", () => {
    const local = new Map([["x", sha("local")]]);
    const remote = new Map([["x", sha("remote")]]);

    expect(mergeErrandTrees(local, remote)).toEqual({ kind: "collision", slugs: ["x"] });
  });

  it("reports every divergent slug, sorted, and never a partial merge", () => {
    const local = new Map([["beta", sha("bL")], ["alpha", sha("aL")], ["ok", sha("s")]]);
    const remote = new Map([["beta", sha("bR")], ["alpha", sha("aR")], ["ok", sha("s")]]);

    expect(mergeErrandTrees(local, remote)).toEqual({
      kind: "collision",
      slugs: ["alpha", "beta"],
    });
  });

  it("returns the populated side when the other is empty", () => {
    const local = new Map([["a", sha("a1")]]);

    expect(mergeErrandTrees(local, new Map())).toEqual({ kind: "merged", entries: local });
    expect(mergeErrandTrees(new Map(), local)).toEqual({ kind: "merged", entries: local });
  });
});
