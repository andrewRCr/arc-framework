/** Lineage JSON decoding, canonical creation, and registered content outcomes. */
import { describe, expect, it } from "vitest";
import { canonicalize } from "../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { LineageRecordSchema, WorkItemRefSchema, parseLineageRecord, writeLineageRecord } from "../../../../../../src/lib/store/kinds/lineage/index.js";
import { LINEAGE_REGISTRATION } from "../../../../../../src/lib/store/kinds/lineage/registration.js";
import { createKindRegistry } from "../../../../../../src/lib/store/registry.js";

const ref = (name: string) => WorkItemRefSchema.parse({ name });
const record = () => LineageRecordSchema.parse({
  schemaVersion: 2, origin: { name: "origin", uid: "6c45c1ac-1371-4cde-bc39-d3f832bfa8db" }, kind: "decompose",
  successors: [ref("a10"), ref("a2")],
  incoming: [
    { dependent: ref("consumer-a"), disposition: { kind: "replace", replacementTargets: [ref("a10"), ref("a2")] } },
    { dependent: ref("consumer-b"), disposition: { kind: "drop", reason: "No remaining dependency" } },
  ],
  outgoing: [
    { prerequisite: ref("foundation-a"), members: [ref("a10"), ref("existing-home")] },
    { prerequisite: ref("foundation-b"), members: [] },
  ],
});

describe("lineage codec", () => {
  it.each([
    ["malformed JSON", "{not json"],
    ["version one", JSON.stringify({ ...record(), schemaVersion: 1 })],
    ["schema violation", JSON.stringify({ ...record(), successors: [] })],
  ])("refuses %s and accepts ordinary repaired JSON", (_label, content) => {
    expect(parseLineageRecord(content)).toBeNull();
    expect(parseLineageRecord(JSON.stringify(record(), null, 2))).toEqual(record());
  });

  it("orders every reference list and outer list without mutating input, then round-trips exact bytes", () => {
    const expected = record();
    const unordered = structuredClone(expected);
    unordered.successors.reverse();
    unordered.incoming.reverse();
    for (const edge of unordered.incoming) if (edge.disposition.kind === "replace") edge.disposition.replacementTargets.reverse();
    unordered.outgoing?.reverse();
    for (const edge of unordered.outgoing ?? []) edge.members.reverse();
    const original = structuredClone(unordered);
    const bytes = writeLineageRecord(unordered);
    expect(bytes).toBe(canonicalize(expected));
    expect(unordered).toEqual(original);
    const parsed = parseLineageRecord(bytes);
    expect(parsed).toEqual(expected);
    expect(parsed === null ? null : writeLineageRecord(parsed)).toBe(bytes);
  });

  it("refuses duplicate input and writes valid repair", () => {
    const value = record();
    expect(() => writeLineageRecord({ ...value, successors: [ref("a10"), ref("a10")] })).toThrow();
    expect(writeLineageRecord(value)).toBe(canonicalize(value));
  });

  it("keeps absent optional identity and outgoing fields out of canonical bytes", () => {
    const value = LineageRecordSchema.parse({
      schemaVersion: 2, origin: { name: "origin", uid: undefined }, kind: "abandon",
      successors: [], incoming: [], outgoing: undefined,
    });
    expect(writeLineageRecord(value)).toBe(canonicalize({
      schemaVersion: 2, origin: ref("origin"), kind: "abandon", successors: [], incoming: [],
    }));
  });
});

describe("lineage registration", () => {
  const parser = createKindRegistry([LINEAGE_REGISTRATION])["lineage/transition"].parser;
  it("returns schema issue paths for refusal and fields for repaired content", () => {
    expect(parser?.(JSON.stringify({ ...record(), successors: [] }))).toMatchObject({
      success: false, error: expect.stringContaining("successors: invalid successor cardinality"),
    });
    expect(parser?.(JSON.stringify(record()))).toEqual({ success: true, data: record() });
  });
  it("returns a JSON refusal and admits repaired content", () => {
    expect(parser?.("{not json")).toMatchObject({ success: false, error: expect.stringContaining("JSON:") });
    expect(parser?.(JSON.stringify(record()))).toEqual({ success: true, data: record() });
  });
});
