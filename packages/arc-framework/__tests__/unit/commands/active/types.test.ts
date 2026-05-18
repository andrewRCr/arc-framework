import { describe, expect, it } from "vitest";

import { validateState } from "../../../../src/commands/active/types.js";

describe("validateState", () => {
  it("returns each codified state verbatim", () => {
    expect(validateState("Planning")).toBe("Planning");
    expect(validateState("Active")).toBe("Active");
    expect(validateState("Integrating")).toBe("Integrating");
    expect(validateState("Shipped")).toBe("Shipped");
  });

  it("maps legacy values to their semantic equivalents in the codified enum", () => {
    expect(validateState("In Progress")).toBe("Active");
    expect(validateState("Paused")).toBe("Active");
    expect(validateState("Complete")).toBe("Integrating");
    expect(validateState("Superseded")).toBe("Shipped");
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
