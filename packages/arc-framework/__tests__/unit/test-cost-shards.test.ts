/** Unit coverage for effective E2E shard membership. */

import { describe, expect, it } from "vitest";

import {
  parseWorkflowE2EAnchors,
  parseWorkflowE2EExclusions,
  validateE2EShardMembership,
} from "../../src/lib/test-cost/shards.js";

describe("parseWorkflowE2EExclusions", () => {
  it("reads the workflow's actual E2E remainder exclusions", () => {
    expect(parseWorkflowE2EExclusions(`
      --exclude='**/anchor-a.e2e.test.ts'
      --exclude='**/anchor-b.e2e.test.ts'
    `)).toEqual(["**/anchor-a.e2e.test.ts", "**/anchor-b.e2e.test.ts"]);
  });
});

describe("parseWorkflowE2EAnchors", () => {
  it("reads the ordered anchor assigned to every workflow leg", () => {
    expect(parseWorkflowE2EAnchors(`
      - shard: 1
        anchor: anchor-b.e2e.test.ts
      - shard: 2
        anchor: anchor-a.e2e.test.ts
    `)).toEqual(["anchor-b.e2e.test.ts", "anchor-a.e2e.test.ts"]);
  });
});

describe("validateE2EShardMembership", () => {
  const whole = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
  const anchors = ["anchor-a.test.ts", "anchor-b.test.ts", "anchor-c.test.ts", "anchor-d.test.ts"];
  const exclusions = anchors.map((anchor) => `**/${anchor}`);
  const discovered = [...whole, ...anchors];

  it("accepts differing proper-subset legs that exactly partition the filtered tier", () => {
    expect(validateE2EShardMembership(discovered, whole, exclusions, [
      ["a.test.ts"],
      ["b.test.ts"],
      ["c.test.ts"],
      ["d.test.ts"],
    ], anchors)).toMatchObject({
      wholeTier: whole,
      legs: [
        { shard: 1, anchor: "anchor-a.test.ts", remainder: ["a.test.ts"] },
        { shard: 2, anchor: "anchor-b.test.ts", remainder: ["b.test.ts"] },
        { shard: 3, anchor: "anchor-c.test.ts", remainder: ["c.test.ts"] },
        { shard: 4, anchor: "anchor-d.test.ts", remainder: ["d.test.ts"] },
      ],
    });
  });

  it("refuses overlap, gaps, and excluded anchors", () => {
    expect(() => validateE2EShardMembership(discovered, whole, exclusions, [
      ["a.test.ts"], ["a.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ], anchors)).toThrow(/exactly one/u);
    expect(() => validateE2EShardMembership(discovered, whole, exclusions, [
      ["a.test.ts"], ["b.test.ts"], ["c.test.ts"], [],
    ], anchors)).toThrow(/partition/u);
    expect(() => validateE2EShardMembership(discovered, whole, exclusions, [
      ["a.test.ts", "anchor-a.test.ts"], ["b.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ], anchors)).toThrow(/excluded anchor/u);
  });

  it("fails loudly when filesOnly-like output repeats the whole tier on every leg", () => {
    expect(() => validateE2EShardMembership(
      discovered,
      whole,
      exclusions,
      [whole, whole, whole, whole],
      anchors,
    ))
      .toThrow(/whole filtered tier/u);
  });

  it("refuses a stale anchor even when its exclusion name matches", () => {
    expect(() => validateE2EShardMembership(whole, whole, exclusions, [
      ["a.test.ts"], ["b.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ], anchors)).toThrow(/anchor.*not found/u);
  });

  it("keeps a valid remainder file whose basename only ends with an anchor name", () => {
    const remainder = ["extended-anchor-a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
    expect(validateE2EShardMembership([...remainder, ...anchors], remainder, exclusions, [
      ["extended-anchor-a.test.ts"], ["b.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ], anchors).wholeTier).toEqual([...remainder].sort());
  });
});
