/** Exact-base append-only merge behavior. */

import { describe, expect, it } from "vitest";

import {
  mergeExpectedBase,
  type BaseMergePort,
} from "../../../../src/scripts/base/merge.js";

const oid = (character: string): string => character.repeat(40);

function repository(base = oid("a"), conflict = false) {
  const state = { base, history: [oid("c")], merging: false };
  const port: BaseMergePort = {
    refreshBase: async () => state.base,
    containsBase: async (baseOid) => state.history.includes(baseOid),
    mergeAppendOnly: async (baseOid) => {
      state.merging = true;
      if (conflict) {
        state.merging = false;
        return "conflict";
      }
      state.history.push(baseOid);
      state.merging = false;
      return "merged";
    },
  };
  return { port, state };
}

describe("base merge", () => {
  it("rejects a moved base without changing history", async () => {
    const { port, state } = repository(oid("b"));
    const before = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a") }, port)).resolves.toMatchObject({
      state: "base-moved",
      nextAction: "rerun-checkpoint",
      expectedBase: oid("a"),
      actualBase: oid("b"),
    });
    expect(state.history).toEqual(before);
  });

  it("appends the expected base without rewriting published history", async () => {
    const { port, state } = repository();
    const published = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a") }, port)).resolves.toMatchObject({
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

    await expect(mergeExpectedBase({ expectedBase: oid("a") }, port)).resolves.toMatchObject({
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: oid("a"),
    });
    expect(state.history).toEqual(before);
  });

  it("returns a conflict only after clearing partial merge state", async () => {
    const { port, state } = repository(oid("a"), true);
    const before = [...state.history];

    await expect(mergeExpectedBase({ expectedBase: oid("a") }, port)).resolves.toMatchObject({
      state: "conflict",
      nextAction: "stop",
      expectedBase: oid("a"),
    });
    expect(state).toMatchObject({ history: before, merging: false });
  });
});
