/** Canonical housekeeping-plan validation and digesting. */

import { describe, expect, it } from "vitest";

import { executePlanEntries, parseHousekeepPlan } from "../../../src/lib/housekeep/plan.js";

const digest = `sha256:${"a".repeat(64)}`;

describe("housekeeping plan", () => {
  it("digests equivalent JSON encodings identically while preserving inbox order", () => {
    const compact = `{"version":1,"entries":[{"title":"A","sourceDigest":"${digest}","disposition":"execute-now"}]}`;
    const spaced = JSON.stringify({ entries: [{ disposition: "execute-now", sourceDigest: digest, title: "A" }], version: 1 }, null, 2);
    expect(parseHousekeepPlan(compact).digest).toBe(parseHousekeepPlan(spaced).digest);
    expect(executePlanEntries(parseHousekeepPlan(compact).plan)).toEqual([{ title: "A", sourceDigest: digest }]);
  });

  it("rejects duplicate titles and disposition-illegal fields", () => {
    const duplicate = { version: 1, entries: [
      { title: "A", sourceDigest: digest, disposition: "retain" },
      { title: "A", sourceDigest: digest, disposition: "dismiss" },
    ] };
    expect(() => parseHousekeepPlan(JSON.stringify(duplicate))).toThrow();
    expect(() => parseHousekeepPlan(JSON.stringify({
      version: 1, entries: [{ title: "A", sourceDigest: digest, disposition: "retain", destination: "x" }],
    }))).toThrow();
  });

  it("normalizes CRLF entry evidence through the source digest contract, not JSON encoding", () => {
    const input = JSON.stringify({
      version: 1,
      entries: [{ title: "A", sourceDigest: digest, disposition: "new-stub", destination: "alpha", commitment: "planned" }],
    }).replaceAll("\n", "\r\n");
    expect(parseHousekeepPlan(input).plan.entries[0]).toMatchObject({ disposition: "new-stub", commitment: "planned" });
  });
});
