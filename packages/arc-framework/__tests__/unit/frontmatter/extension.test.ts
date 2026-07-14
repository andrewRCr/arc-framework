/**
 * Unit tests for the extension-file frontmatter schema parser.
 *
 * Mirrors the method-schema tests with `active` in place of `override-active`.
 */

import { describe, it, expect } from "vitest";

import { parseExtensionFrontmatter } from "../../../src/lib/frontmatter/extension.js";

const validExtension = [
  "---",
  "name: post-task-quality",
  "description: Additional quality checks after each task",
  "active: false",
  "---",
  "",
].join("\n");

describe("parseExtensionFrontmatter", () => {
  it("returns the typed frontmatter with no errors when all fields are valid", () => {
    const result = parseExtensionFrontmatter(validExtension, "post-task-quality");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({
      name: "post-task-quality",
      description: "Additional quality checks after each task",
      active: false,
    });
  });

  it("accepts `related` when provided as a string array", () => {
    const content = [
      "---",
      "name: pre-merge",
      "description: Review ceremony",
      "related:",
      "  - post-task-quality",
      "active: true",
      "---",
      "",
    ].join("\n");
    const result = parseExtensionFrontmatter(content, "pre-merge");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter?.related).toEqual(["post-task-quality"]);
  });

  it("reports missing-field diagnostics for each required field", () => {
    const content = "---\nunrelated: field\n---\n";
    const result = parseExtensionFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`name`"))).toBe(true);
    expect(result.errors.some((e) => e.includes("`description`"))).toBe(true);
    expect(result.errors.some((e) => e.includes("`active`"))).toBe(true);
  });

  it("rejects non-boolean `active` as a type mismatch", () => {
    const content = [
      "---",
      "name: example",
      "description: Example",
      'active: "yes"',
      "---",
      "",
    ].join("\n");
    const result = parseExtensionFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`active`"))).toBe(true);
  });

  it("rejects non-array `related` as a type mismatch", () => {
    const content = [
      "---",
      "name: example",
      "description: Example",
      "related: post-task-quality",
      "active: false",
      "---",
      "",
    ].join("\n");
    const result = parseExtensionFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`related`"))).toBe(true);
  });

  it("rejects `name` that does not match the file basename", () => {
    const content = [
      "---",
      "name: post-task-quality",
      "description: Example",
      "active: false",
      "---",
      "",
    ].join("\n");
    const result = parseExtensionFrontmatter(content, "pre-merge");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("pre-merge"))).toBe(true);
  });

  it("surfaces a missing-frontmatter diagnostic when no triple-dash block", () => {
    const result = parseExtensionFrontmatter("# body only\n", "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /frontmatter/.test(e))).toBe(true);
  });

  it("surfaces malformed-YAML errors through the schema parser", () => {
    const content = "---\nname: [unterminated\n---\n";
    const result = parseExtensionFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /YAML|yaml/.test(e))).toBe(true);
  });

  it("rejects an array-rooted YAML document with a mapping diagnostic", () => {
    const content = "---\n- one\n- two\n---\n";
    const result = parseExtensionFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors).toEqual(["frontmatter must be a YAML mapping"]);
  });
});
