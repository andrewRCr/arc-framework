/** Structural contract for the reusable commit-message fixture corpus. */

import { describe, expect, it } from "vitest";
import { COMMIT_MESSAGE_FIXTURES } from "../../fixtures/commit-msg/cases.js";

describe("commit-message fixture corpus", () => {
  it("uses unique names and byte-valued messages", () => {
    const names = COMMIT_MESSAGE_FIXTURES.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const fixture of COMMIT_MESSAGE_FIXTURES) {
      expect(fixture.messageBytes).toBeInstanceOf(Uint8Array);
      expect(fixture.messageBytes.length).toBeGreaterThan(0);
    }
  });

  it("covers all three verdicts", () => {
    expect(new Set(COMMIT_MESSAGE_FIXTURES.map(({ expected }) => expected.verdict))).toEqual(
      new Set(["pass", "pass-with-warnings", "fail"]),
    );
  });

  it("enumerates only the five intentional cutovers", () => {
    expect(
      new Set(COMMIT_MESSAGE_FIXTURES.flatMap(({ divergence }) => (divergence ? [divergence] : []))),
    ).toEqual(
      new Set([
        "trailer-position",
        "continuation-folding",
        "last-occurrence",
        "pattern-dialect",
        "invalid-active-config",
      ]),
    );
    for (const fixture of COMMIT_MESSAGE_FIXTURES.filter(({ divergence }) => divergence)) {
      expect(fixture.bashVerdict).toBeDefined();
    }
  });
});
