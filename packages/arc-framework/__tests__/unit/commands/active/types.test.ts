import { describe, expect, it } from "vitest";

import {
  validateClass,
  validatePriority,
  validateState,
} from "../../../../src/commands/active/types.js";

describe("validateState", () => {
  it("returns each codified state verbatim", () => {
    expect(validateState("Planning")).toBe("Planning");
    expect(validateState("Active")).toBe("Active");
    expect(validateState("Integrating")).toBe("Integrating");
    expect(validateState("Shipped")).toBe("Shipped");
  });

  it("returns 'unknown' for retired legacy values", () => {
    expect(validateState("In Progress")).toBe("unknown");
    expect(validateState("Paused")).toBe("unknown");
    expect(validateState("Complete")).toBe("unknown");
    expect(validateState("Superseded")).toBe("unknown");
  });

  it("returns 'unknown' for null", () => {
    expect(validateState(null)).toBe("unknown");
  });

  it("returns 'unknown' for empty or whitespace-only strings", () => {
    expect(validateState("")).toBe("unknown");
    expect(validateState("   ")).toBe("unknown");
  });

  it("returns 'unknown' for unrecognized values", () => {
    expect(validateState("Bogus")).toBe("unknown");
    expect(validateState("active")).toBe("unknown"); // case-sensitive
    expect(validateState("Paused (2026-04-12)")).toBe("unknown"); // parenthetical suffix not stripped
  });
});

describe("validatePriority", () => {
  it("returns each codified priority verbatim", () => {
    expect(validatePriority("P1")).toBe("P1");
    expect(validatePriority("P2")).toBe("P2");
    expect(validatePriority("P3")).toBe("P3");
  });

  it("defaults a missing value to P3", () => {
    expect(validatePriority(null)).toBe("P3");
    expect(validatePriority("")).toBe("P3");
    expect(validatePriority("   ")).toBe("P3");
    expect(validatePriority("[none]")).toBe("P3");
  });

  it("defaults out-of-range and malformed values to P3 without throwing", () => {
    expect(validatePriority("P0")).toBe("P3");
    expect(validatePriority("P5")).toBe("P3");
    expect(validatePriority("p1")).toBe("P3"); // case-sensitive
    expect(validatePriority("Bogus")).toBe("P3");
  });
});

describe("validateClass", () => {
  it("normalizes each resolved weight to its display form, case-insensitively", () => {
    expect(validateClass("Light")).toBe("Light");
    expect(validateClass("light")).toBe("Light");
    expect(validateClass("Heavy")).toBe("Heavy");
    expect(validateClass("heavy")).toBe("Heavy");
    expect(validateClass("  HEAVY  ")).toBe("Heavy"); // trimmed + case-folded
  });

  it("resolves the pre-classification sentinel to [TBD]", () => {
    expect(validateClass("[TBD]")).toBe("[TBD]");
  });

  it("resolves a missing or empty value to [TBD]", () => {
    expect(validateClass(null)).toBe("[TBD]");
    expect(validateClass("")).toBe("[TBD]");
    expect(validateClass("   ")).toBe("[TBD]");
  });

  it("resolves unrecognized values to [TBD] without throwing", () => {
    expect(validateClass("medium")).toBe("[TBD]");
    expect(validateClass("[none]")).toBe("[TBD]");
    expect(validateClass("Bogus")).toBe("[TBD]");
  });
});
