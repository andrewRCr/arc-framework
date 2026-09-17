import { describe, expect, it, vi } from "vitest";

import {
  classifyPredecessorRelation,
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

describe("predecessor relation classification", () => {
  it("reports an unresolvable ancestry read rather than a relation", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "unresolvable",
      observedIsAncestorOfBound: "unresolvable",
      mergeBaseCount: 1,
    })).toEqual({ kind: "unknown" });
  });

  it("reports an append-only advance when the bound head is an ancestor of the observed one", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "ancestor",
      observedIsAncestorOfBound: "not-ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "advanced" });
  });

  it("reports a rewind when the observed head is an ancestor of the bound one", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "rewound" });
  });

  it("reports divergence when neither head is an ancestor of the other", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "not-ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "diverged", mergeBaseCount: 1 });
  });

  it("reports the pair unmoved when both heads name the same revision", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("b"),
      boundIsAncestorOfObserved: "ancestor",
      observedIsAncestorOfBound: "ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "unchanged" });
  });

  it("never reads an externally rewritten head as the head it bound", () => {
    const rewritten = { boundHead: oid("b"), observedHead: oid("c") } as const;

    expect(classifyPredecessorRelation({
      ...rewritten,
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "not-ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "diverged", mergeBaseCount: 1 });
    expect(classifyPredecessorRelation({
      ...rewritten,
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "rewound" });
  });

  it("carries a single merge base on a diverged pair as one", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "not-ancestor",
      mergeBaseCount: 1,
    })).toEqual({ kind: "diverged", mergeBaseCount: 1 });
  });

  it("carries the count a pair with more than one merge base was read at", () => {
    expect(classifyPredecessorRelation({
      boundHead: oid("b"),
      observedHead: oid("c"),
      boundIsAncestorOfObserved: "not-ancestor",
      observedIsAncestorOfBound: "not-ancestor",
      mergeBaseCount: 2,
    })).toEqual({ kind: "diverged", mergeBaseCount: 2 });
  });
});
