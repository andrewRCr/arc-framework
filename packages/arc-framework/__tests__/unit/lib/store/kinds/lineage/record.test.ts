import { describe, expect, it } from "vitest";

import {
  parseLineageRecord,
  writeLineageRecord,
} from "../../../../../../src/lib/store/kinds/lineage/index.js";

function parse(value: unknown) {
  return parseLineageRecord(JSON.stringify(value));
}

function decomposeRecord() {
  return {
    schemaVersion: 2,
    origin: { name: "retired-origin" },
    kind: "decompose",
    successors: [{ name: "new-a" }, { name: "new-b" }],
    incoming: [
      {
        dependent: { name: "consumer-a" },
        disposition: { kind: "replace", replacementTargets: [{ name: "new-a" }, { name: "new-b" }] },
      },
      {
        dependent: { name: "consumer-b" },
        disposition: { kind: "drop", reason: "No surviving dependency" },
      },
    ],
    outgoing: [],
  };
}

describe("lineage record admission", () => {
  it("accepts ordinary JSON and writes one deterministic serialization", () => {
    const content = JSON.stringify({
      successors: [{ name: "new-a" }, { name: "new-b" }],
      schemaVersion: 2,
      kind: "decompose",
      incoming: [
        {
          disposition: { replacementTargets: [{ name: "new-a" }, { name: "new-b" }], kind: "replace" },
          dependent: { name: "consumer-b" },
        },
        {
          dependent: { name: "consumer-a" },
          disposition: { reason: "No surviving dependency", kind: "drop" },
        },
      ],
      origin: { name: "retired-origin" },
      outgoing: [],
    }, null, 2);

    const record = parseLineageRecord(content);

    expect(record).not.toBeNull();
    expect(record === null ? null : writeLineageRecord(record)).toBe(
      "{\"incoming\":[{\"dependent\":{\"name\":\"consumer-a\"},\"disposition\":{\"kind\":\"drop\",\"reason\":\"No surviving dependency\"}},{\"dependent\":{\"name\":\"consumer-b\"},\"disposition\":{\"kind\":\"replace\",\"replacementTargets\":[{\"name\":\"new-a\"},{\"name\":\"new-b\"}]}}],\"kind\":\"decompose\",\"origin\":{\"name\":\"retired-origin\"},\"outgoing\":[],\"schemaVersion\":2,\"successors\":[{\"name\":\"new-a\"},{\"name\":\"new-b\"}]}",
    );
  });

  it.each([
    { kind: "rename", successors: [{ name: "replacement" }], incoming: [] },
    { kind: "abandon", successors: [], incoming: [] },
    { kind: "decompose", successors: [{ name: "replacement" }], incoming: [] },
  ] as const)("accepts the $kind successor cardinality", ({ kind, successors, incoming }) => {
    expect(parse({ schemaVersion: 2, origin: { name: "retired-origin" }, kind, successors, incoming, ...(kind === "decompose" ? { outgoing: [] } : {}) })).not.toBeNull();
  });

  it.each([
    ["unknown version", { ...decomposeRecord(), schemaVersion: 1 }],
    ["extra root field", { ...decomposeRecord(), sealed: true }],
    ["extra edge field", {
      ...decomposeRecord(),
      incoming: [{ ...decomposeRecord().incoming[0], edgeId: "sha256:not-authority" }],
    }],
    ["invalid origin slug", { ...decomposeRecord(), origin: { name: "Retired_Origin" } }],
    ["invalid successor slug", { ...decomposeRecord(), successors: [{ name: "new_a" }] }],
    ["invalid dependent slug", {
      ...decomposeRecord(),
      incoming: [{ ...decomposeRecord().incoming[0], dependent: { name: "consumer_a" } }],
    }],
    ["invalid replacement target slug", {
      ...decomposeRecord(),
      incoming: [{
        dependent: { name: "consumer-a" },
        disposition: { kind: "replace", replacementTargets: [{ name: "new_a" }] },
      }],
    }],
    ["duplicate dependents", {
      ...decomposeRecord(),
      incoming: [decomposeRecord().incoming[0], decomposeRecord().incoming[0]],
    }],
    ["empty drop reason", {
      ...decomposeRecord(),
      incoming: [{ dependent: { name: "consumer-a" }, disposition: { kind: "drop", reason: "  " } }],
    }],
    ["unknown disposition", {
      ...decomposeRecord(),
      incoming: [{ dependent: { name: "consumer-a" }, disposition: { kind: "retarget", targetSlug: "new-a" } }],
    }],
    ["rename without one successor", { ...decomposeRecord(), kind: "rename", successors: [], incoming: [], outgoing: undefined }],
    ["abandon with a successor", { ...decomposeRecord(), kind: "abandon", successors: [{ name: "new-a" }], incoming: [], outgoing: undefined }],
    ["decompose without a new successor", { ...decomposeRecord(), successors: [] }],
    ["unordered successors", { ...decomposeRecord(), successors: [{ name: "new-b" }, { name: "new-a" }] }],
    ["duplicate successors", { ...decomposeRecord(), successors: [{ name: "new-a" }, { name: "new-a" }] }],
    ["unordered replacement targets", {
      ...decomposeRecord(),
      incoming: [{
        dependent: { name: "consumer-a" },
        disposition: { kind: "replace", replacementTargets: [{ name: "new-b" }, { name: "new-a" }] },
      }],
    }],
    ["duplicate replacement targets", {
      ...decomposeRecord(),
      incoming: [{
        dependent: { name: "consumer-a" },
        disposition: { kind: "replace", replacementTargets: [{ name: "new-a" }, { name: "new-a" }] },
      }],
    }],
    ["direct transition edge", { ...decomposeRecord(), kind: "rename", successors: [{ name: "new-a" }], outgoing: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(parse(value)).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseLineageRecord("{not json")).toBeNull();
  });
});
