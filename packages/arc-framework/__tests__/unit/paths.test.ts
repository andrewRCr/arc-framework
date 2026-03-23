import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { getArcTemplatePath, getInternalTemplatePath } from "../../src/lib/paths.js";

describe("getArcTemplatePath", () => {
  it("returns an absolute path ending with /arc", () => {
    const result = getArcTemplatePath();
    expect(isAbsolute(result)).toBe(true);
    expect(result).toMatch(/\/arc$/);
  });

  it("resolves within the package directory", () => {
    const result = getArcTemplatePath();
    expect(result).toContain("packages/arc-framework");
  });

  it("points to a directory that exists after build", () => {
    // arc/ is a build artifact containing framework templates
    // This test verifies the resolution is correct post-build
    const result = getArcTemplatePath();
    expect(existsSync(result)).toBe(true);
  });
});

describe("getInternalTemplatePath", () => {
  it("returns an absolute path ending with /templates", () => {
    const result = getInternalTemplatePath();
    expect(isAbsolute(result)).toBe(true);
    expect(result).toMatch(/\/templates$/);
  });

  it("resolves within the package directory", () => {
    const result = getInternalTemplatePath();
    expect(result).toContain("packages/arc-framework");
  });
});
