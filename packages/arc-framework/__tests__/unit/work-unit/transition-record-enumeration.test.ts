import { describe, expect, it } from "vitest";

import {
  validateTransitionRecordEnumeration,
  type TransitionRecordEnumerationEntry,
} from "../../../src/lib/work-unit/transition-record-enumeration.js";
import {
  serializeTransitionRecord,
  type TransitionRecord,
} from "../../../src/lib/work-unit/transition-record.js";

const encoder = new TextEncoder();

function record(origin: string): TransitionRecord {
  return { schemaVersion: 1, origin, kind: "abandon", successors: [], edges: [] };
}

function entry(
  filename: string,
  candidate: TransitionRecord,
  overrides: Partial<TransitionRecordEnumerationEntry> = {},
): TransitionRecordEnumerationEntry {
  return {
    filename,
    mode: "100644",
    type: "blob",
    content: encoder.encode(serializeTransitionRecord(candidate)),
    ...overrides,
  };
}

describe("transition record namespace enumeration", () => {
  it("groups by authoritative content origin despite mismatched valid filenames", () => {
    const alpha = record("alpha");
    const beta = record("beta");

    expect(validateTransitionRecordEnumeration([
      entry("alpha.json", beta),
      entry("beta.json", alpha),
    ])).toEqual({
      status: "valid",
      groups: [
        { origin: "alpha", records: [alpha] },
        { origin: "beta", records: [beta] },
      ],
    });
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
      overrides: { content: encoder.encode(JSON.stringify({ ...record("origin"), schemaVersion: 2 })) },
    },
    {
      label: "invalid shape",
      overrides: { content: encoder.encode(JSON.stringify({ ...record("origin"), successors: ["wrong"] })) },
    },
    {
      label: "duplicate dependents",
      overrides: {
        content: encoder.encode(JSON.stringify({
          schemaVersion: 1,
          origin: "origin",
          kind: "decompose",
          successors: ["successor"],
          edges: [
            { dependent: "consumer", disposition: { kind: "replace", replacementTargets: ["successor"] } },
            { dependent: "consumer", disposition: { kind: "drop", reason: "retired" } },
          ],
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
