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
  it("reports a member built on top of the tip as an append-only advance", async () => {
    const deps = dependencies();
    deps.readAncestry = vi.fn(async (ancestor: string) =>
      ancestor === oid("c") ? "ancestor" as const : "not-ancestor" as const);

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toEqual({
      status: "resolved",
      relation: { kind: "advanced", observedTip: oid("c"), chainBase: oid("c") },
    });
    expect(deps.readOverlap).not.toHaveBeenCalled();
  });

  it("reports a member behind the tip as rewound rather than as a pair that diverged", async () => {
    const deps = dependencies();
    deps.readAncestry = vi.fn(async (ancestor: string) =>
      ancestor === oid("b") ? "ancestor" as const : "not-ancestor" as const);
    deps.readOverlap = vi.fn(async () => ({
      status: "available" as const,
      mergeBase: oid("b"),
      overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
    }));

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toEqual({
      status: "resolved",
      relation: {
        kind: "rewound",
        observedTip: oid("c"),
        chainBase: oid("b"),
        mergeBase: oid("b"),
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
  });

  it("reports an empty overlap that is not behind the tip as diverged, with a chain base", async () => {
    await expect(predecessorRelation({
      memberHead: oid("b"), observedTip: oid("c"),
    }, dependencies())).resolves.toEqual({
      status: "resolved",
      relation: {
        kind: "diverged",
        observedTip: oid("c"),
        chainBase: oid("a"),
        mergeBase: oid("a"),
        mergeBaseCount: 1,
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
  });

  it("still names the chain base on a diverged pair whose substantive paths intersect", async () => {
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

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toEqual({
      status: "resolved",
      relation: {
        kind: "diverged",
        observedTip: oid("c"),
        chainBase: oid("a"),
        mergeBase: oid("a"),
        mergeBaseCount: 1,
        overlap: {
          status: "available",
          substantivePaths: ["src/shared.ts"],
          regenerablePaths: [".arc/backlog/ROADMAP.md"],
        },
      },
    });
  });

  it("reports a pair with more than one merge base as its own arm", async () => {
    const deps = dependencies();
    deps.readOverlap = vi.fn(async () => ({
      status: "ambiguous" as const,
      detail: "The revisions have multiple best merge bases.",
    }));

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toMatchObject({
      status: "ambiguous",
      memberHead: oid("b"),
      observedTip: oid("c"),
      detail: "The revisions have multiple best merge bases.",
    });
  });

  it("carries the merge that collapses the two bases as that arm's remedy", async () => {
    const deps = dependencies();
    deps.readOverlap = vi.fn(async () => ({
      status: "ambiguous" as const,
      detail: "The revisions have multiple best merge bases.",
    }));

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toMatchObject({
      status: "ambiguous",
      remedy: { kind: "delivery-base-merge-required", automatedCommand: ["git", "merge", oid("c")] },
    });
  });

  it("still reports an overlap it could not read as unavailable", async () => {
    const deps = dependencies();
    deps.readOverlap = vi.fn(async () => ({
      status: "unavailable" as const,
      reason: "merge-base-failed" as const,
      detail: "The merge base could not be read.",
    }));

    await expect(predecessorRelation({ memberHead: oid("b"), observedTip: oid("c") }, deps)).resolves.toEqual({
      status: "unavailable",
      detail: "The merge base could not be read.",
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
      status: "unrelated",
      observedTip: oid("c"),
      detail: "The revisions have no common ancestor.",
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
