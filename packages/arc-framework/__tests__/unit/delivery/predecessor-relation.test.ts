import { describe, expect, it, vi } from "vitest";

import {
  predecessorRelation,
  type PredecessorRelationDependencies,
} from "../../../src/lib/delivery/predecessor-relation.js";

const oid = (character: string): string => character.repeat(40);

function dependencies(): PredecessorRelationDependencies {
  return {
    readAncestry: vi.fn(async () => "not-ancestor" as const),
    readOverlap: vi.fn(async () => ({
      status: "available" as const,
      mergeBase: oid("a"),
      overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
    })),
  };
}

describe("predecessor relation", () => {
  it("returns exact when the observed tip is an ancestor of the member", async () => {
    const deps = dependencies();
    deps.readAncestry = vi.fn(async () => "ancestor" as const);

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toEqual({
      status: "resolved",
      relation: { kind: "exact", observedTip: oid("c"), chainBase: oid("c") },
    });
    expect(deps.readOverlap).not.toHaveBeenCalled();
  });

  it("returns disjoint-ahead with the merge base as chain base", async () => {
    await expect(predecessorRelation({
      memberHead: oid("b"), observedTip: oid("c"),
    }, dependencies())).resolves.toEqual({
      status: "resolved",
      relation: {
        kind: "disjoint-ahead",
        observedTip: oid("c"),
        chainBase: oid("a"),
        mergeBase: oid("a"),
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
  });

  it("returns overlapping-ahead when substantive paths intersect", async () => {
    const deps = dependencies();
    deps.readOverlap = vi.fn(async () => ({
      status: "available" as const,
      mergeBase: oid("a"),
      overlap: {
        status: "available" as const,
        substantivePaths: ["src/shared.ts"],
        regenerablePaths: [".arc/backlog/ROADMAP.md"],
      },
    }));

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toMatchObject({
      status: "resolved",
      relation: {
        kind: "overlapping-ahead",
        observedTip: oid("c"),
        mergeBase: oid("a"),
        overlap: { substantivePaths: ["src/shared.ts"] },
      },
    });
  });

  it("keeps no-common-ancestor distinct from unavailable evidence", async () => {
    const unrelated = dependencies();
    unrelated.readOverlap = vi.fn(async () => ({
      status: "unrelated" as const,
      leftRevision: oid("b"),
      rightRevision: oid("c"),
      detail: "The revisions have no common ancestor.",
    }));
    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, unrelated)).resolves.toEqual({
      status: "resolved",
      relation: {
        kind: "unrelated",
        observedTip: oid("c"),
        detail: "The revisions have no common ancestor.",
      },
    });

    const unavailable = dependencies();
    unavailable.readAncestry = vi.fn(async () => "unresolvable" as const);
    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, unavailable)).resolves.toEqual({
      status: "unavailable",
      detail: "The observed tip ancestry could not be established.",
    });
  });
});
