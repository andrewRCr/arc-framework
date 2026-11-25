import { describe, expect, it } from "vitest";

import {
  queryTransitionDisposition,
} from "../../../src/lib/work-unit/transition-disposition-query.js";
import { LineageRecordSchema, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import {
  validateTransitionRecordEnumeration,
  type TransitionRecordEnumerationResult,
} from "../../../src/lib/work-unit/transition-record-enumeration.js";

function enumeration(...records: LineageRecord[]): TransitionRecordEnumerationResult {
  return records.length === 0
    ? { status: "valid", groups: [] }
    : { status: "valid", groups: [{ origin: records[0]?.origin.name ?? "origin", records }] };
}

describe("transition disposition query", () => {
  it.each([
    {
      record: LineageRecordSchema.parse({
        schemaVersion: 2,
        origin: { name: "origin" },
        kind: "rename",
        successors: [{ name: "successor" }],
        incoming: [],
      }) satisfies LineageRecord,
      expected: { kind: "retarget", targetSlug: "successor" },
    },
    {
      record: LineageRecordSchema.parse({
        schemaVersion: 2,
        origin: { name: "origin" },
        kind: "abandon",
        successors: [],
        incoming: [],
      }) satisfies LineageRecord,
      expected: { kind: "abandoned" },
    },
  ])("projects a direct transition for any dependent", ({ record, expected }) => {
    expect(queryTransitionDisposition(
      enumeration(record),
      { origin: "origin", dependentSlug: "any-dependent" },
    )).toEqual({ status: "unique", disposition: expected });
  });

  it("resolves decompose dispositions only by dependent slug", () => {
    const candidate: LineageRecord = LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "decompose",
      successors: [{ name: "first" }, { name: "second" }],
      incoming: [
        { dependent: { name: "replace-me" }, disposition: { kind: "replace", replacementTargets: [{ name: "first" }] } },
        { dependent: { name: "drop-me" }, disposition: { kind: "drop", reason: "no longer needed" } },
      ],
      outgoing: [],
    });
    const query = (dependentSlug: string) => queryTransitionDisposition(
      enumeration(candidate),
      { origin: "origin", dependentSlug },
    );

    expect(query("replace-me")).toEqual({
      status: "unique",
      disposition: { kind: "replace", replacementTargets: ["first"] },
    });
    expect(query("drop-me")).toEqual({
      status: "unique",
      disposition: { kind: "drop", reason: "no longer needed" },
    });
    expect(query("first")).toEqual({ status: "unmapped-dependent" });
  });

  it("distinguishes absent, origin-local ambiguity, and global corruption", () => {
    const first: LineageRecord = LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "rename",
      successors: [{ name: "first" }],
      incoming: [],
    });
    const second: LineageRecord = LineageRecordSchema.parse({ ...first, successors: [{ name: "second" }] });
    const unrelated: LineageRecord = LineageRecordSchema.parse({
      schemaVersion: 2,
      origin: { name: "unrelated" },
      kind: "abandon",
      successors: [],
      incoming: [],
    });
    const input = { origin: "origin", dependentSlug: "consumer" };
    const localAmbiguity: TransitionRecordEnumerationResult = {
      status: "valid",
      groups: [
        { origin: "origin", records: [first, second] },
        { origin: "unrelated", records: [unrelated] },
      ],
    };

    expect(queryTransitionDisposition(enumeration(), input)).toEqual({ status: "absent" });
    expect(queryTransitionDisposition(localAmbiguity, input))
      .toEqual({ status: "ambiguous" });
    expect(queryTransitionDisposition(localAmbiguity, { origin: "unrelated", dependentSlug: "consumer" }))
      .toEqual({ status: "unique", disposition: { kind: "abandoned" } });
    expect(queryTransitionDisposition({ status: "namespace-corrupt" }, input))
      .toEqual({ status: "namespace-corrupt" });
  });

  it.each([
    ["malformed JSON", "{"],
    ["unknown version", JSON.stringify({
      schemaVersion: 1,
      origin: { name: "origin" },
      kind: "abandon",
      successors: [],
      incoming: [],
    })],
    ["duplicate dependent", JSON.stringify({
      schemaVersion: 2,
      origin: { name: "origin" },
      kind: "decompose",
      successors: [{ name: "successor" }],
      incoming: [
        { dependent: { name: "consumer" }, disposition: { kind: "replace", replacementTargets: [{ name: "successor" }] } },
        { dependent: { name: "consumer" }, disposition: { kind: "drop", reason: "retired" } },
      ],
      outgoing: [],
    })],
  ])("poisons every query for a reachable %s record", (_label, content) => {
    const corrupt = validateTransitionRecordEnumeration([{
      filename: "origin.json",
      mode: "100644",
      type: "blob",
      content: new TextEncoder().encode(content),
    }]);
    for (const origin of ["origin", "unrelated"]) {
      expect(queryTransitionDisposition(corrupt, { origin, dependentSlug: "consumer" }))
        .toEqual({ status: "namespace-corrupt" });
    }
  });
});
