/** Unit coverage for effective E2E shard membership. */

import { describe, expect, it } from "vitest";

import {
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

describe("validateE2EShardMembership", () => {
  const whole = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];

  it("accepts differing proper-subset legs that exactly partition the filtered tier", () => {
    expect(validateE2EShardMembership(whole, ["anchor.test.ts"], [
      ["a.test.ts"],
      ["b.test.ts"],
      ["c.test.ts"],
      ["d.test.ts"],
    ])).toMatchObject({ wholeTier: whole });
  });

  it("refuses overlap, gaps, and excluded anchors", () => {
    expect(() => validateE2EShardMembership(whole, [], [
      ["a.test.ts"], ["a.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ])).toThrow(/exactly one/u);
    expect(() => validateE2EShardMembership(whole, [], [
      ["a.test.ts"], ["b.test.ts"], ["c.test.ts"], [],
    ])).toThrow(/partition/u);
    expect(() => validateE2EShardMembership(whole, ["anchor.test.ts"], [
      ["a.test.ts", "anchor.test.ts"], ["b.test.ts"], ["c.test.ts"], ["d.test.ts"],
    ])).toThrow(/excluded anchor/u);
  });

  it("fails loudly when filesOnly-like output repeats the whole tier on every leg", () => {
    expect(() => validateE2EShardMembership(whole, [], [whole, whole, whole, whole]))
      .toThrow(/whole filtered tier/u);
  });
});
