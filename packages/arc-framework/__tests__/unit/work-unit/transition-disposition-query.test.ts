import { describe, expect, it } from "vitest";

import {
  queryTransitionDisposition,
} from "../../../src/lib/work-unit/transition-disposition-query.js";
import type { TransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import type { TransitionRecordEnumerationResult } from "../../../src/lib/work-unit/transition-record-enumeration.js";

function enumeration(...records: TransitionRecord[]): TransitionRecordEnumerationResult {
  return records.length === 0
    ? { status: "valid", groups: [] }
    : { status: "valid", groups: [{ origin: records[0]?.origin ?? "origin", records }] };
}

describe("transition disposition query", () => {
  it.each([
    {
      record: {
        schemaVersion: 1,
        origin: "origin",
        kind: "rename",
        successors: ["successor"],
        edges: [],
      } satisfies TransitionRecord,
      expected: { kind: "retarget", targetSlug: "successor" },
    },
    {
      record: {
        schemaVersion: 1,
        origin: "origin",
        kind: "abandon",
        successors: [],
        edges: [],
      } satisfies TransitionRecord,
      expected: { kind: "abandoned" },
    },
  ])("projects a direct transition for any dependent", ({ record, expected }) => {
    expect(queryTransitionDisposition(
      enumeration(record),
      { origin: "origin", dependentSlug: "any-dependent" },
    )).toEqual({ status: "unique", disposition: expected });
  });

  it("resolves decompose dispositions only by dependent slug", () => {
    const candidate: TransitionRecord = {
      schemaVersion: 1,
      origin: "origin",
      kind: "decompose",
      successors: ["first", "second"],
      edges: [
        { dependent: "replace-me", disposition: { kind: "replace", replacementTargets: ["first"] } },
        { dependent: "drop-me", disposition: { kind: "drop", reason: "no longer needed" } },
      ],
    };
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
    const first: TransitionRecord = {
      schemaVersion: 1,
      origin: "origin",
      kind: "rename",
      successors: ["first"],
      edges: [],
    };
    const second: TransitionRecord = { ...first, successors: ["second"] };
    const input = { origin: "origin", dependentSlug: "consumer" };

    expect(queryTransitionDisposition(enumeration(), input)).toEqual({ status: "absent" });
    expect(queryTransitionDisposition(enumeration(first, second), input))
      .toEqual({ status: "ambiguous" });
    expect(queryTransitionDisposition({ status: "namespace-corrupt" }, input))
      .toEqual({ status: "namespace-corrupt" });
  });
});
