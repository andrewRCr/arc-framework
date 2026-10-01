/** Exact-base append-only merge behavior. */

import { describe, expect, it } from "vitest";

import {
  BaseMergeInputSchema,
  mergeExpectedBase,
  type BaseMergePort,
} from "../../../../src/scripts/base/merge.js";

const oid = (character: string): string => character.repeat(40);

function repository(base = oid("a"), conflict = false) {
  const state = { base, head: oid("c"), history: [oid("c")], merging: false };
  const port: BaseMergePort = {
    refreshBase: async () => state.base,
    refreshHead: async () => state.head,
    isAncestor: async (ancestorOid, descendantOid) =>
      descendantOid === state.head && state.history.includes(ancestorOid),
    mergeAppendOnly: async (baseOid) => {
      state.merging = true;
      if (conflict) {
        state.merging = false;
        return { status: "conflict", detail: "Merge conflicts remain in: conflict.txt." } as const;
      }
      state.history.push(baseOid);
      state.merging = false;
      return { status: "merged", headOid: oid("d") } as const;
    },
  };
  return { port, state };
}

describe("base merge", () => {
  it("rejects a moved Candidate head without changing history", async () => {
    const { port, state } = repository();
    const before = [...state.history];

    await expect(mergeExpectedBase(BaseMergeInputSchema.parse({
      expectedBase: oid("a"),
      expectedHead: oid("b"),
    }), port)).resolves.toMatchObject({
      state: "head-moved",
      reason: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: oid("a"),
      expectedHead: oid("b"),
      actualHead: oid("c"),
      coordinates: {
        expectedBase: oid("a"), expectedHead: oid("b"), actualBase: oid("a"), actualHead: oid("c"),
      },
      continuation: { kind: "terminal-explanation" },
    });
    expect(state.history).toEqual(before);
  });

  it("rejects a moved base without changing history", async () => {
    const { port, state } = repository(oid("b"));
    const before = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a"), expectedHead: oid("c") }, port))
      .resolves.toMatchObject({
      state: "base-moved",
      reason: "base-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: oid("a"),
      actualBase: oid("b"),
      detail: expect.stringContaining("configured base moved"),
      continuation: { kind: "terminal-explanation" },
    });
    expect(state.history).toEqual(before);
  });

  it("appends the expected base without rewriting published history", async () => {
    const { port, state } = repository();
    const published = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a"), expectedHead: oid("c") }, port))
      .resolves.toMatchObject({
      state: "merged",
      nextAction: "run-quality-gates",
      expectedBase: oid("a"),
    });
    expect(state.history.slice(0, published.length)).toEqual(published);
    expect(state.history.at(-1)).toBe(oid("a"));
  });

  it("skips a base revision already contained by the candidate", async () => {
    const { port, state } = repository();
    state.history.push(oid("a"));
    const before = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a"), expectedHead: oid("c") }, port))
      .resolves.toMatchObject({
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: oid("a"),
    });
    expect(state.history).toEqual(before);
  });

  it("reruns the checkpoint when the Candidate head is contained by base", async () => {
    const { port, state } = repository();
    const before = [...state.history];
    const ancestryPort = {
      ...port,
      isAncestor: async (ancestorOid: string, descendantOid: string) =>
        ancestorOid === oid("c") && descendantOid === oid("a"),
    } as BaseMergePort;

    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
    }, ancestryPort)).resolves.toMatchObject({
      state: "head-contained-by-base",
      reason: "head-contained-by-base",
      nextAction: "rerun-checkpoint",
      expectedBase: oid("a"),
      expectedHead: oid("c"),
      actualBase: oid("a"),
      actualHead: oid("c"),
      continuation: { kind: "terminal-explanation" },
    });
    expect(state.history).toEqual(before);
  });

  it("rechecks both endpoints immediately before a divergent merge", async () => {
    const { port, state } = repository();
    const before = [...state.history];
    let ancestryChecks = 0;
    const movingPort: BaseMergePort = {
      ...port,
      isAncestor: async () => {
        ancestryChecks += 1;
        if (ancestryChecks === 2) state.head = oid("b");
        return false;
      },
    };

    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
    }, movingPort)).resolves.toMatchObject({
      state: "head-moved",
      nextAction: "rerun-checkpoint",
      expectedHead: oid("c"),
      actualHead: oid("b"),
    });
    expect(state.history).toEqual(before);
  });

  it("returns a typed operational refusal for a malformed mutation observation", async () => {
    const { port } = repository();
    const malformedPort: BaseMergePort = {
      ...port,
      mergeAppendOnly: async () => ({ status: "head-moved", actualHead: "HEAD" }),
    };

    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
    }, malformedPort)).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "operational-failure",
      expectedBase: oid("a"),
      expectedHead: oid("c"),
      actualBase: oid("a"),
      actualHead: oid("c"),
      detail: expect.stringMatching(/object|invalid/iu),
      continuation: { kind: "terminal-explanation" },
    });
  });

  it("preserves a refreshed base coordinate when the head observation fails", async () => {
    const { port } = repository();
    port.refreshHead = async () => {
      throw new Error("head observation failed");
    };
    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
    }, port)).resolves.toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      detail: "head observation failed",
      coordinates: {
        expectedBase: oid("a"), expectedHead: oid("c"), actualBase: oid("a"), actualHead: null,
      },
      continuation: { kind: "terminal-explanation" },
    });
  });

  it("returns a conflict only after clearing partial merge state", async () => {
    const { port, state } = repository(oid("a"), true);
    const before = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a"), expectedHead: oid("c") }, port))
      .resolves.toMatchObject({
      state: "conflict",
      reason: "merge-conflict",
      nextAction: "stop",
      expectedBase: oid("a"),
      detail: "Merge conflicts remain in: conflict.txt.",
      coordinates: {
        expectedBase: oid("a"), expectedHead: oid("c"), actualBase: oid("a"), actualHead: oid("c"),
      },
      continuation: { kind: "terminal-explanation" },
    });
    expect(state).toMatchObject({ history: before, merging: false });
  });

  it("passes the checkpoint-authorized regenerable remedy into the append-only merge", async () => {
    const { port } = repository();
    let observedRemedy: string | undefined;
    port.mergeAppendOnly = async (_base, _head, remedy) => {
      observedRemedy = remedy;
      return { status: "merged", headOid: oid("d") };
    };
    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
      conflictRemedy: "regenerate-roadmap",
    }, port)).resolves.toMatchObject({ state: "merged", nextAction: "run-quality-gates" });
    expect(observedRemedy).toBe("regenerate-roadmap");
  });

  it("preserves a refused regenerable remedy with useful detail", async () => {
    const { port } = repository();
    port.mergeAppendOnly = async () => ({ status: "remedy-refused", detail: "Render was indeterminate." });
    await expect(mergeExpectedBase({
      expectedBase: oid("a"),
      expectedHead: oid("c"),
      conflictRemedy: "regenerate-roadmap",
    }, port)).resolves.toMatchObject({
      state: "regenerable-refused",
      reason: "regenerable-remedy-refused",
      nextAction: "stop",
      detail: "Render was indeterminate.",
      coordinates: {
        expectedBase: oid("a"), expectedHead: oid("c"), actualBase: oid("a"), actualHead: oid("c"),
      },
      continuation: { kind: "terminal-explanation" },
    });
  });

  it("normalizes and bounds adapter failure detail", async () => {
    const { port } = repository();
    port.isAncestor = async () => {
      throw new Error(`adapter\n failure ${"x".repeat(5_000)}`);
    };
    const result = await mergeExpectedBase({ expectedBase: oid("a"), expectedHead: oid("c") }, port);
    expect(result).toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      coordinates: {
        expectedBase: oid("a"), expectedHead: oid("c"), actualBase: oid("a"), actualHead: oid("c"),
      },
      continuation: { kind: "terminal-explanation" },
    });
    if (result.state !== "blocked") throw new Error("Expected a blocked result.");
    expect(result.detail).not.toContain("\n");
    expect(result.detail.length).toBeLessThanOrEqual(4_096);
  });
});
