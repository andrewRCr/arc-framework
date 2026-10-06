/** Unit coverage for effective E2E shard membership. */

import { describe, expect, it } from "vitest";

import {
  parseWorkflowE2EShardCount,
  validateE2EShardMembership,
} from "../../src/lib/test-cost/shards.js";

describe("parseWorkflowE2EShardCount", () => {
  const workflow = (shards: string): string => `
jobs:
  unit:
    strategy:
      matrix:
        shard: [1, 2]
  e2e:
    strategy:
      fail-fast: false
      matrix:
        shard: ${shards}
`;

  it("reads the E2E job's shard matrix, not another job's", () => {
    expect(parseWorkflowE2EShardCount(workflow("[1, 2, 3, 4]"))).toBe(4);
  });

  it("refuses a missing or non-contiguous matrix", () => {
    expect(() => parseWorkflowE2EShardCount("jobs:\n  e2e:\n    runs-on: ubuntu-latest\n"))
      .toThrow(/no E2E shard matrix/u);
    expect(() => parseWorkflowE2EShardCount(workflow("[1, 3]"))).toThrow(/contiguously/u);
  });
});

describe("validateE2EShardMembership", () => {
  const whole = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];

  it("accepts legs that exactly partition the tier", () => {
    expect(validateE2EShardMembership(whole, [
      ["b.test.ts", "a.test.ts"],
      ["c.test.ts"],
      ["d.test.ts"],
    ])).toEqual({
      wholeTier: whole,
      legs: [
        { shard: 1, files: ["a.test.ts", "b.test.ts"] },
        { shard: 2, files: ["c.test.ts"] },
        { shard: 3, files: ["d.test.ts"] },
      ],
    });
  });

  it("refuses overlap, gaps, and empty legs", () => {
    expect(() => validateE2EShardMembership(whole, [
      ["a.test.ts", "b.test.ts"], ["b.test.ts", "c.test.ts", "d.test.ts"],
    ])).toThrow(/exactly one/u);
    expect(() => validateE2EShardMembership(whole, [["a.test.ts"], ["b.test.ts", "c.test.ts"]]))
      .toThrow(/partition/u);
    expect(() => validateE2EShardMembership(whole, [whole.slice(0, 3), whole.slice(3), []]))
      .toThrow(/non-empty/u);
  });

  it("fails loudly when filesOnly-like output repeats the whole tier on every leg", () => {
    expect(() => validateE2EShardMembership(whole, [whole, whole, whole, whole])).toThrow(/whole E2E tier/u);
  });
});
