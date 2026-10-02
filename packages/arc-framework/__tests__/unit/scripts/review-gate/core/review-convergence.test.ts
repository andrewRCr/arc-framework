/** The one rule deciding whether a review lane needs another pass after its findings settle. */

import { describe, expect, it } from "vitest";

import {
  fixesMaterialFinding,
  isMaterialSeverity,
} from "../../../../../src/scripts/review-gate/core/review-convergence.js";

const finding = (
  disposition: "fix" | "defer" | "reject",
  verifiedSeverity: "critical" | "major" | "minor" | null,
) => ({ disposition, verifiedSeverity });

describe("isMaterialSeverity", () => {
  it.each([
    ["critical", true],
    ["major", true],
    ["minor", false],
    [null, false],
  ] as const)("treats %s as material: %s", (severity, material) => {
    expect(isMaterialSeverity(severity)).toBe(material);
  });
});

describe("fixesMaterialFinding", () => {
  it.each(["major", "critical"] as const)("requires another pass after an approved %s fix", (severity) => {
    expect(fixesMaterialFinding([finding("fix", severity)])).toBe(true);
  });

  it.each(["defer", "reject"] as const)("settles a confirmed major approved as %s", (disposition) => {
    expect(fixesMaterialFinding([finding(disposition, "major"), finding(disposition, "critical")])).toBe(false);
  });

  it("settles a set whose only fixes are minor", () => {
    expect(fixesMaterialFinding([finding("fix", "minor"), finding("defer", "major")])).toBe(false);
  });

  it("settles an unsupported observation, which carries no verified grade", () => {
    expect(fixesMaterialFinding([finding("reject", null)])).toBe(false);
  });

  it("finds one material fix among settled findings", () => {
    expect(fixesMaterialFinding([
      finding("defer", "critical"),
      finding("reject", "major"),
      finding("fix", "minor"),
      finding("fix", "major"),
    ])).toBe(true);
  });

  it("settles an empty set", () => {
    expect(fixesMaterialFinding([])).toBe(false);
  });
});
