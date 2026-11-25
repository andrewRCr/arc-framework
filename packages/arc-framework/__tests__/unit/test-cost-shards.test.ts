/** Exact partition checks for duration-balanced E2E membership. */
import { describe, expect, it } from "vitest";
import { parseWorkflowE2EShards, validateE2EShardMembership } from "../../src/lib/test-cost/shards.js";

describe("literal workflow E2E shards", () => {
  it("reads the E2E matrix independently from other tier matrices", () => {
    expect(parseWorkflowE2EShards('jobs:\n  unit:\n    strategy:\n      matrix:\n        shard: [1,2]\n  e2e:\n    strategy:\n      matrix:\n        shard: [1,2,3,4]\n')).toEqual([1,2,3,4]);
  });
  it.each(['[1,3]', '[1,1]', '[]', "'${{ fromJSON(inputs.shards) }}'"])("refuses non-contiguous or dynamic matrices", (matrix) => {
    expect(() => parseWorkflowE2EShards(`jobs:\n  e2e:\n    strategy:\n      matrix:\n        shard: ${matrix}\n`)).toThrow();
  });
});

describe("balanced E2E membership", () => {
  const whole = ["d.test.ts", "b.test.ts", "a.test.ts", "c.test.ts"];
  it("retains the complete tier as one disjoint partition without anchor exclusions", () => {
    expect(validateE2EShardMembership(whole, [["a.test.ts", "c.test.ts"], ["d.test.ts", "b.test.ts"]]))
      .toEqual({ wholeTier: ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"], legs: [
        { shard: 1, files: ["a.test.ts", "c.test.ts"] }, { shard: 2, files: ["b.test.ts", "d.test.ts"] },
      ] });
  });
  it.each([
    [["a.test.ts", "b.test.ts"], ["a.test.ts", "c.test.ts", "d.test.ts"]],
    [["a.test.ts"], ["b.test.ts", "c.test.ts"]],
    [["a.test.ts", "b.test.ts"], ["c.test.ts", "d.test.ts", "foreign.test.ts"]],
    [["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"], []],
  ].map((legs) => ({ legs })))("refuses overlap, gaps, foreign files and a repeated whole tier", ({ legs }) => {
    expect(() => validateE2EShardMembership(whole, legs)).toThrow();
  });
});
