/** Complete-basis identity reconciliation and transaction behavior. */

import { describe, expect, it } from "vitest";

import { reconcileIdentityObjects } from "../../src/lib/errand/identity-transaction.js";

function objects(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe("identity object reconciliation", () => {
  it("preserves independent additions, updates, and deletions from both sides", () => {
    const result = reconcileIdentityObjects(
      objects({ updateLocal: "a", deleteLocal: "b", updateRemote: "c" }),
      objects({ updateLocal: "aa", updateRemote: "c", addLocal: "d" }),
      objects({ updateLocal: "a", deleteLocal: "b", updateRemote: "cc", addRemote: "e" }),
    );

    expect(result).toEqual({
      kind: "merged",
      objects: objects({ updateLocal: "aa", updateRemote: "cc", addLocal: "d", addRemote: "e" }),
    });
  });

  it("refuses divergent changes to the same key", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      objects({ shared: "b" }),
      objects({ shared: "c" }),
    )).toEqual({ kind: "conflict", keys: ["shared"] });
  });

  it("accepts convergent changes to the same key", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      objects({ shared: "b" }),
      objects({ shared: "b" }),
    )).toEqual({ kind: "merged", objects: objects({ shared: "b" }) });
  });

  it("preserves a key deletion made independently on both sides", () => {
    expect(reconcileIdentityObjects(
      objects({ shared: "a" }),
      new Map(),
      new Map(),
    )).toEqual({ kind: "merged", objects: new Map() });
  });

  it("treats an absent remote and common basis as empty without dropping local state", () => {
    expect(reconcileIdentityObjects(new Map(), objects({ local: "a" }), new Map())).toEqual({
      kind: "merged",
      objects: objects({ local: "a" }),
    });
  });
});
