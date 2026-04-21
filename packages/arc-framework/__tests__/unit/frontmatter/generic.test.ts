/**
 * Unit tests for the generic frontmatter extractor.
 *
 * Covers triple-dash YAML extraction, absent-frontmatter handling, and
 * malformed-YAML error reporting. Schema-specific validation lives in
 * `method.test.ts` / `extension.test.ts`.
 */

import { describe, it, expect } from "vitest";

import { parseFrontmatter } from "../../../src/lib/frontmatter/generic.js";

describe("parseFrontmatter", () => {
  it("parses valid triple-dash YAML frontmatter into a data object", () => {
    const content = "---\nname: hello\ncount: 42\n---\n\nBody content\n";
    const result = parseFrontmatter(content);
    expect(result.parseError).toBeUndefined();
    expect(result.data).toEqual({ name: "hello", count: 42 });
  });

  it("returns data: null with no error when frontmatter is absent", () => {
    const content = "# Heading\n\nBody only, no triple-dash block.\n";
    const result = parseFrontmatter(content);
    expect(result.parseError).toBeUndefined();
    expect(result.data).toBeNull();
  });

  it("reports parseError without throwing on malformed YAML", () => {
    const content = "---\nname: [unterminated\n---\n\nBody\n";
    const result = parseFrontmatter(content);
    expect(result.data).toBeNull();
    expect(result.parseError).toBeDefined();
    expect(result.parseError).toMatch(/.+/);
  });
});
