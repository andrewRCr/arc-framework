import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/kernel/index.js";
import {
  classifyTeardownSelection,
  type TeardownSelectionDecision,
} from "../../../src/lib/work-unit/teardown-selection.js";

const checkout = {
  path: "/repo-wt",
  head: "b".repeat(40),
  branch: "feat/demo",
  detached: false,
  primary: false,
} as const;
const marker = {
  kind: "present" as const,
  marker: {
    spawnedByArc: true,
    spawningIdentity: "andrew",
    createdAt: "2026-07-21T00:00:00.000Z",
    wuName: "demo",
  },
  bytes: Buffer.from('{"marker":"exact"}\n'),
};

function decide(overrides: Partial<Parameters<typeof classifyTeardownSelection>[0]> = {}): TeardownSelectionDecision {
  return classifyTeardownSelection({
    checkout,
    marker,
    identity: "andrew",
    subject: { kind: "work-unit", name: "demo" },
    ...overrides,
  });
}

describe("teardown selection", () => {
  it("depends only on exact checkout and marker evidence, regardless of former lease shape", () => {
    expect(decide()).toEqual({
      kind: "clear",
      checkout,
      subject: { kind: "work-unit", name: "demo" },
      markerGeneration: digestBytes(marker.bytes),
    });
  });

  it.each([
    ["malformed marker", { marker: { kind: "malformed", message: "bad", path: "/marker" } }, "marker-malformed"],
    ["markerless linked checkout", { marker: { kind: "absent" } }, "markerless"],
    ["foreign identity", {
      marker: { ...marker, marker: { ...marker.marker, spawningIdentity: "other" } },
    }, "cross-identity"],
    ["different subject", { subject: { kind: "work-unit", name: "other" } }, "subject-mismatch"],
  ] as const)("keeps %s outside destructive authority", (_label, overrides, reason) => {
    expect(decide(overrides)).toMatchObject({ kind: "manual", reason });
  });

  it("allows a markerless primary only as exact topology evidence", () => {
    expect(decide({
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      marker: { kind: "absent" },
    })).toEqual({
      kind: "clear",
      checkout: { ...checkout, path: "/repo", branch: "main", primary: true },
      subject: { kind: "work-unit", name: "demo" },
      markerGeneration: null,
    });
  });
});
