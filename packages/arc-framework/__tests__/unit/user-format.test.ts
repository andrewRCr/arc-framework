/**
 * Unit tests for user-command summary formatters.
 *
 * Covers `buildLoadSummary`'s ancestor-distance line: emitted only when
 * distance > 0, using the "Loaded from N commits back" phrasing.
 */

import { describe, it, expect } from "vitest";

import { buildLoadSummary } from "../../src/commands/user/format.js";
import type { UserLoadResult } from "../../src/commands/user/types.js";

function baseResult(overrides: Partial<UserLoadResult>): UserLoadResult {
  return {
    identity: "andrew",
    commit: "abc1234",
    fileCount: 2,
    fromAncestor: false,
    ancestorDistance: 0,
    warnings: [],
    ...overrides,
  };
}

describe("buildLoadSummary — ancestor distance reporting", () => {
  it("omits the ancestor-distance line when distance is 0", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 0, fromAncestor: false }));

    expect(summary).not.toContain("Loaded from");
    expect(summary).not.toContain("commits back");
  });

  it("emits 'Loaded from N commits back' when distance is greater than 0", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 7, fromAncestor: true }));

    expect(summary).toContain("Loaded from 7 commit(s) back.");
  });

  it("does not emit the legacy 'loaded from a reachable ancestor' phrasing", () => {
    const summary = buildLoadSummary(baseResult({ ancestorDistance: 3, fromAncestor: true }));

    expect(summary).not.toContain("loaded from a reachable ancestor");
    expect(summary).not.toContain("behind HEAD");
  });
});
