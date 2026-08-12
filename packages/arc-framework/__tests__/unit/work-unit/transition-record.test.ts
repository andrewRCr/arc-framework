import { describe, expect, it } from "vitest";

import {
  parseTransitionRecord,
  serializeTransitionRecord,
} from "../../../src/lib/work-unit/transition-record.js";

function parse(value: unknown) {
  return parseTransitionRecord(JSON.stringify(value));
}

function decomposeRecord() {
  return {
    schemaVersion: 1,
    origin: "retired-origin",
    kind: "decompose",
    successors: ["new-a", "new-b"],
    edges: [
      {
        dependent: "consumer-a",
        disposition: { kind: "replace", replacementTargets: ["new-a", "new-b"] },
      },
      {
        dependent: "consumer-b",
        disposition: { kind: "drop", reason: "No surviving dependency" },
      },
    ],
  };
}

describe("transition record", () => {
  it("accepts ordinary JSON and writes one deterministic serialization", () => {
    const content = JSON.stringify({
      successors: ["new-a", "new-b"],
      schemaVersion: 1,
      kind: "decompose",
      edges: [
        {
          disposition: { replacementTargets: ["new-a", "new-b"], kind: "replace" },
          dependent: "consumer-b",
        },
        {
          dependent: "consumer-a",
          disposition: { reason: "No surviving dependency", kind: "drop" },
        },
      ],
      origin: "retired-origin",
    }, null, 2);

    const record = parseTransitionRecord(content);

    expect(record).not.toBeNull();
    expect(record === null ? null : serializeTransitionRecord(record)).toBe(
      "{\"edges\":[{\"dependent\":\"consumer-a\",\"disposition\":{\"kind\":\"drop\",\"reason\":\"No surviving dependency\"}},{\"dependent\":\"consumer-b\",\"disposition\":{\"kind\":\"replace\",\"replacementTargets\":[\"new-a\",\"new-b\"]}}],\"kind\":\"decompose\",\"origin\":\"retired-origin\",\"schemaVersion\":1,\"successors\":[\"new-a\",\"new-b\"]}",
    );
  });

  it.each([
    { kind: "rename", successors: ["replacement"], edges: [] },
    { kind: "abandon", successors: [], edges: [] },
    { kind: "decompose", successors: ["replacement"], edges: [] },
  ] as const)("accepts the $kind successor cardinality", ({ kind, successors, edges }) => {
    expect(parse({ schemaVersion: 1, origin: "retired-origin", kind, successors, edges })).not.toBeNull();
  });

  it.each([
    ["unknown version", { ...decomposeRecord(), schemaVersion: 2 }],
    ["extra root field", { ...decomposeRecord(), sealed: true }],
    ["extra edge field", {
      ...decomposeRecord(),
      edges: [{ ...decomposeRecord().edges[0], edgeId: "sha256:not-authority" }],
    }],
    ["invalid origin slug", { ...decomposeRecord(), origin: "Retired_Origin" }],
    ["invalid successor slug", { ...decomposeRecord(), successors: ["new_a"] }],
    ["invalid dependent slug", {
      ...decomposeRecord(),
      edges: [{ ...decomposeRecord().edges[0], dependent: "consumer_a" }],
    }],
    ["invalid replacement target slug", {
      ...decomposeRecord(),
      edges: [{
        dependent: "consumer-a",
        disposition: { kind: "replace", replacementTargets: ["new_a"] },
      }],
    }],
    ["duplicate dependents", {
      ...decomposeRecord(),
      edges: [decomposeRecord().edges[0], decomposeRecord().edges[0]],
    }],
    ["empty drop reason", {
      ...decomposeRecord(),
      edges: [{ dependent: "consumer-a", disposition: { kind: "drop", reason: "  " } }],
    }],
    ["unknown disposition", {
      ...decomposeRecord(),
      edges: [{ dependent: "consumer-a", disposition: { kind: "retarget", targetSlug: "new-a" } }],
    }],
    ["rename without one successor", { ...decomposeRecord(), kind: "rename", successors: [], edges: [] }],
    ["abandon with a successor", { ...decomposeRecord(), kind: "abandon", successors: ["new-a"], edges: [] }],
    ["decompose without a new successor", { ...decomposeRecord(), successors: [] }],
    ["unordered successors", { ...decomposeRecord(), successors: ["new-b", "new-a"] }],
    ["duplicate successors", { ...decomposeRecord(), successors: ["new-a", "new-a"] }],
    ["unordered replacement targets", {
      ...decomposeRecord(),
      edges: [{
        dependent: "consumer-a",
        disposition: { kind: "replace", replacementTargets: ["new-b", "new-a"] },
      }],
    }],
    ["duplicate replacement targets", {
      ...decomposeRecord(),
      edges: [{
        dependent: "consumer-a",
        disposition: { kind: "replace", replacementTargets: ["new-a", "new-a"] },
      }],
    }],
    ["direct transition edge", { ...decomposeRecord(), kind: "rename", successors: ["new-a"] }],
  ])("rejects %s", (_label, value) => {
    expect(parse(value)).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseTransitionRecord("{not json")).toBeNull();
  });
});
