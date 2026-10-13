/**
 * Unit coverage for common-basis errand reconciliation: independent updates,
 * deletions, byte-identical idempotence, and divergent changes to the same slug.
 */

import { describe, it, expect } from "vitest";

import { mergeErrandTrees } from "../../src/lib/errand/index.js";

/** A 40-char hex blob sha from a short seed. */
const sha = (seed: string): string => seed.padEnd(40, "0");

describe("mergeErrandTrees", () => {
  it("unions distinct slugs from each side", () => {
    const local = new Map([["a", sha("a1")]]);
    const remote = new Map([["b", sha("b1")]]);

    const result = mergeErrandTrees(local, remote, new Map());

    expect(result).toEqual({
      kind: "merged",
      entries: new Map([["a", sha("a1")], ["b", sha("b1")]]),
    });
  });

  it("keeps a byte-identical same-slug entry once (idempotent)", () => {
    const local = new Map([["x", sha("xx")]]);
    const remote = new Map([["x", sha("xx")]]);

    const result = mergeErrandTrees(local, remote, new Map());

    expect(result).toEqual({ kind: "merged", entries: new Map([["x", sha("xx")]]) });
  });

  it("reports a divergent same-slug entry as a collision", () => {
    const local = new Map([["x", sha("local")]]);
    const remote = new Map([["x", sha("remote")]]);

    expect(mergeErrandTrees(local, remote, new Map())).toEqual({ kind: "collision", slugs: ["x"] });
  });

  it("reports every divergent slug, sorted, and never a partial merge", () => {
    const local = new Map([["beta", sha("bL")], ["alpha", sha("aL")], ["ok", sha("s")]]);
    const remote = new Map([["beta", sha("bR")], ["alpha", sha("aR")], ["ok", sha("s")]]);

    expect(mergeErrandTrees(local, remote, new Map())).toEqual({
      kind: "collision",
      slugs: ["alpha", "beta"],
    });
  });

  it("returns the populated side when the other is empty", () => {
    const local = new Map([["a", sha("a1")]]);

    expect(mergeErrandTrees(local, new Map(), new Map())).toEqual({ kind: "merged", entries: local });
    expect(mergeErrandTrees(new Map(), local, new Map())).toEqual({ kind: "merged", entries: local });
  });

  it("keeps a remote-only update against the common base", () => {
    const base = new Map([["shared", sha("a0")]]);
    const remote = new Map([["shared", sha("a1")]]);
    expect(mergeErrandTrees(base, remote, base)).toEqual({ kind: "merged", entries: remote });
  });

  it("keeps a local-only update against the common base", () => {
    const base = new Map([["shared", sha("a0")]]);
    const local = new Map([["shared", sha("a1")]]);
    expect(mergeErrandTrees(local, base, base)).toEqual({ kind: "merged", entries: local });
  });

  it("keeps a remote-only deletion instead of resurrecting the base record", () => {
    const base = new Map([["shared", sha("a0")]]);
    expect(mergeErrandTrees(base, new Map(), base)).toEqual({ kind: "merged", entries: new Map() });
  });

  it("keeps a local-only deletion instead of resurrecting the base record", () => {
    const base = new Map([["shared", sha("a0")]]);
    expect(mergeErrandTrees(new Map(), base, base)).toEqual({ kind: "merged", entries: new Map() });
  });

  it.each(["local", "remote"])("reports a %s deletion colliding with the other side's update", (deletedSide) => {
    const base = new Map([["shared", sha("a0")]]);
    const edited = new Map([["shared", sha("a1")]]);
    const local = deletedSide === "local" ? new Map<string, string>() : edited;
    const remote = deletedSide === "remote" ? new Map<string, string>() : edited;
    expect(mergeErrandTrees(local, remote, base)).toEqual({ kind: "collision", slugs: ["shared"] });
  });

});
