/** Writer duration artifacts must describe disjoint complete project/path identities. */
import { expect, it } from "vitest";
import { mergeTestDurations, overlayTestDurations } from "../helpers/merge-test-durations.js";

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

it("updates the measured entries of a handed input and keeps every tier and entry the writers did not measure", () => {
  const unit = native([["unit:kept.test.ts", { duration: 4, failed: false }]]);
  const overlaid = overlayTestDurations({ unit, e2e: "", integration: native([
    ["integration:other.test.ts", { duration: 900, failed: false }],
    ["integration:store-ref-a.test.ts", { duration: 1000, failed: false }],
  ]) }, { integration: native([
    ["integration:store-ref-a.test.ts", { duration: 30000, failed: false }],
    ["integration:store-ref-new.test.ts", { duration: 45000, failed: false }],
  ]) });
  expect(overlaid.unit).toBe(unit);
  expect(overlaid.e2e).toBe("");
  expect(JSON.parse(overlaid.integration ?? "null")).toEqual({ version: "4.1.8", results: [
    ["integration:other.test.ts", { duration: 900, failed: false }],
    ["integration:store-ref-a.test.ts", { duration: 30000, failed: false }],
    ["integration:store-ref-new.test.ts", { duration: 45000, failed: false }],
  ] });
});

it("fills a handed tier that held no recorded results", () => {
  const fresh = native([["integration:store-ref-a.test.ts", { duration: 30000, failed: false }]]);
  expect(JSON.parse(overlayTestDurations({ integration: "" }, { integration: fresh }).integration ?? "null"))
    .toEqual(JSON.parse(fresh));
});
