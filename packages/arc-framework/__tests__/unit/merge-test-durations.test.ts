/** Writer duration artifacts must describe disjoint complete project/path identities. */
import { expect, it } from "vitest";
import { mergeTestDurations } from "../helpers/merge-test-durations.js";

const native = (results: [string, { duration: number; failed: boolean }][]) => JSON.stringify({ version: "4.1.8", results });
it("merges disjoint shards into one native file per tier, preserving project identity", () => {
  const merged = mergeTestDurations([
    { tier: "unit", content: native([["unit:same.test.ts", { duration: 4, failed: false }]]) },
    { tier: "unit", content: native([["unit-mocks:same.test.ts", { duration: 7, failed: false }]]) },
    { tier: "integration", content: native([["integration:native.test.ts", { duration: 20, failed: false }]]) },
  ]);
  expect(JSON.parse(merged.unit ?? "null")).toEqual({ version: "4.1.8", results: [
    ["unit:same.test.ts", { duration: 4, failed: false }], ["unit-mocks:same.test.ts", { duration: 7, failed: false }],
  ] });
  expect(JSON.parse(merged.integration ?? "null")).toEqual({ version: "4.1.8", results: [
    ["integration:native.test.ts", { duration: 20, failed: false }],
  ] });
});

it("refuses overlapping complete keys even when their result values agree", () => {
  const content = native([["unit:same.test.ts", { duration: 4, failed: false }]]);
  expect(() => mergeTestDurations([{ tier: "unit", content }, { tier: "unit", content }]))
    .toThrow("Overlapping duration membership: unit:same.test.ts");
});
