/** Unit coverage for timeout headroom and expiring-substrate cost share. */

import { describe, expect, it } from "vitest";

import {
  isSubstrateBoundFile,
  resolveTimeoutHeadroom,
  summarizeSubstrateShare,
} from "../../src/lib/test-cost/metrics.js";
import type { TestCostFile } from "../../src/lib/test-cost/capture.js";

describe("resolveTimeoutHeadroom", () => {
  it("reports whole-test headroom against the Vitest task ceiling", () => {
    expect(resolveTimeoutHeadroom(12_000, 30_000)).toEqual({
      timeoutCeilingMs: 30_000,
      headroomMs: 18_000,
      headroomFraction: 0.6,
    });
  });
});

describe("substrate-bound share", () => {
  it.each([
    "__tests__/integration/user-local-lifecycle.test.ts",
    "__tests__/integration/user-remote-lifecycle.test.ts",
    "__tests__/integration/user-notes-compaction.test.ts",
    "__tests__/integration/notes-publication-proof.test.ts",
    "__tests__/integration/sync-state-ref.test.ts",
    "__tests__/integration/multi-clone.test.ts",
    "__tests__/e2e/sync-purity.e2e.test.ts",
    "__tests__/unit/user-sync-compaction.test.ts",
    "__tests__/unit/git/user-sync.test.ts",
    "__tests__/unit/user-sync/schema.test.ts",
  ])("classifies the settled notes/sync/multi-clone rule: %s", (path) => {
    expect(isSubstrateBoundFile(path)).toBe(true);
  });

  it("does not classify unrelated files whose names merely contain sync", () => {
    expect(isSubstrateBoundFile("__tests__/integration/framework-sync.test.ts")).toBe(false);
  });

  it("reports a duration share and zero when no file matches", () => {
    const file = (path: string, durationMs: number): TestCostFile => ({
      path,
      tier: "integration",
      collectDurationMs: 0,
      setupDurationMs: 0,
      fixedCostMs: 0,
      testTimeMs: durationMs,
      executionDurationMs: durationMs,
      durationMs,
      tests: [],
    });
    expect(summarizeSubstrateShare([
      file("__tests__/integration/user-local-lifecycle.test.ts", 15),
      file("__tests__/integration/user-remote-lifecycle.test.ts", 10),
      file("__tests__/integration/other.test.ts", 75),
    ])).toEqual({
      durationMs: 25,
      shareFraction: 0.25,
      files: [
        "__tests__/integration/user-local-lifecycle.test.ts",
        "__tests__/integration/user-remote-lifecycle.test.ts",
      ],
    });
    expect(summarizeSubstrateShare([file("other.test.ts", 100)])).toEqual({
      durationMs: 0,
      shareFraction: 0,
      files: [],
    });
  });
});
