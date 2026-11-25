import { describe, expect, it } from "vitest";

import {
  validateTransitionRecordEnumeration,
  type TransitionRecordEnumerationEntry,
} from "../../../src/lib/work-unit/transition-record-enumeration.js";
import { LineageRecordSchema, writeLineageRecord, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { queryTransitionDisposition } from "../../../src/lib/work-unit/transition-disposition-query.js";

const encoder = new TextEncoder();

function record(origin: string): LineageRecord {
  return LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: origin }, kind: "abandon", successors: [], incoming: [] });
}

function entry(
  filename: string,
  candidate: LineageRecord,
  overrides: Partial<TransitionRecordEnumerationEntry> = {},
): TransitionRecordEnumerationEntry {
  return {
    filename,
    mode: "100644",
    type: "blob",
    content: encoder.encode(writeLineageRecord(candidate)),
    ...overrides,
  };
}

describe("transition record namespace enumeration", () => {
  it("groups by authoritative content origin despite mismatched valid filenames", () => {
    const alpha: LineageRecord = LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "alpha" },
      kind: "rename",
      successors: [{ name: "alpha-successor" }],
      incoming: [],
    });
    const beta = record("beta");

    const enumeration = validateTransitionRecordEnumeration([
      entry("alpha.json", beta),
      entry("beta.json", alpha),
    ]);
    expect(enumeration).toEqual({
      status: "valid",
      groups: [
        { origin: "alpha", records: [alpha] },
        { origin: "beta", records: [beta] },
      ],
    });
    expect(queryTransitionDisposition(enumeration, { origin: "alpha", dependentSlug: "consumer" }))
      .toEqual({ status: "unique", disposition: { kind: "retarget", targetSlug: "alpha-successor" } });
    expect(queryTransitionDisposition(enumeration, { origin: "beta", dependentSlug: "consumer" }))
      .toEqual({ status: "unique", disposition: { kind: "abandoned" } });
  });

  it("preserves byte-identical entries as origin-local multiplicity", () => {
    const candidate = record("shared-origin");

    const result = validateTransitionRecordEnumeration([
      entry("first.json", candidate),
      entry("second.json", candidate),
    ]);

    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error(result.status);
    expect(result.groups).toEqual([{
      origin: "shared-origin",
      records: [candidate, candidate],
    }]);
  });

  it.each([
    { label: "nested filename", overrides: { filename: "nested/origin.json" } },
    { label: "malformed filename", overrides: { filename: "Not Valid.json" } },
    { label: "invalid UTF-8", overrides: { content: Uint8Array.from([0xc3, 0x28]) } },
    { label: "invalid JSON", overrides: { content: encoder.encode("{") } },
    {
      label: "unknown version",
      overrides: { content: encoder.encode(JSON.stringify({ ...record("origin"), schemaVersion: 1 })) },
    },
    {
      label: "invalid shape",
      overrides: { content: encoder.encode(JSON.stringify({ ...record("origin"), successors: ["wrong"] })) },
    },
    {
      label: "duplicate dependents",
      overrides: {
        content: encoder.encode(JSON.stringify({
          schemaVersion: 2,
          origin: { name: "origin" },
          kind: "decompose",
          successors: [{ name: "successor" }],
          incoming: [
            { dependent: { name: "consumer" }, disposition: { kind: "replace", replacementTargets: [{ name: "successor" }] } },
            { dependent: { name: "consumer" }, disposition: { kind: "drop", reason: "retired" } },
          ],
          outgoing: [],
        })),
      },
    },
    { label: "symlink", overrides: { mode: "120000" } },
    { label: "tree", overrides: { type: "tree" } },
    { label: "executable blob", overrides: { mode: "100755" } },
  ])("fails the complete namespace closed for a reachable $label", ({ overrides }) => {
    const corrupt = entry("origin.json", record("origin"), overrides);

    expect(validateTransitionRecordEnumeration([
      entry("unrelated.json", record("unrelated")),
      corrupt,
    ])).toEqual({ status: "namespace-corrupt", filename: corrupt.filename });
  });

  it("accepts an absent or empty namespace snapshot", () => {
    expect(validateTransitionRecordEnumeration([])).toEqual({ status: "valid", groups: [] });
  });
});
