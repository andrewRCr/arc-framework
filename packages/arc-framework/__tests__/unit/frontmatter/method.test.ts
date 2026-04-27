/**
 * Unit tests for the method-file frontmatter schema parser.
 *
 * Covers required-field presence (name, description, override-active),
 * type validation, optional `related` handling, and basename matching.
 */

import { describe, it, expect } from "vitest";

import { parseMethodFrontmatter } from "../../../src/lib/frontmatter/method.js";

const validMethod = [
  "---",
  "name: commit-format",
  "description: Commit message format",
  "related:",
  "  - commit-context-format",
  "override-active: false",
  "---",
  "",
].join("\n");

describe("parseMethodFrontmatter", () => {
  it("returns the typed frontmatter with no errors when all fields are valid", () => {
    const result = parseMethodFrontmatter(validMethod, "commit-format");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({
      name: "commit-format",
      description: "Commit message format",
      related: ["commit-context-format"],
      "override-active": false,
    });
  });

  it("accepts method frontmatter without the optional `related` field", () => {
    const content = [
      "---",
      "name: issue-triage",
      "description: Severity triage",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "issue-triage");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter?.related).toBeUndefined();
  });

  it("reports a diagnostic naming the missing `name` field", () => {
    const content = [
      "---",
      "description: Example",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`name`"))).toBe(true);
  });

  it("reports a diagnostic naming the missing `description` field", () => {
    const content = [
      "---",
      "name: example",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "example");
    expect(result.errors.some((e) => e.includes("`description`"))).toBe(true);
  });

  it("reports a diagnostic naming the missing `override-active` field", () => {
    const content = [
      "---",
      "name: example",
      "description: Example",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "example");
    expect(result.errors.some((e) => e.includes("`override-active`"))).toBe(true);
  });

  it("rejects non-boolean `override-active` as a type mismatch", () => {
    const content = [
      "---",
      "name: example",
      "description: Example",
      'override-active: "false"',
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`override-active`"))).toBe(true);
  });

  it("rejects non-array `related` as a type mismatch", () => {
    const content = [
      "---",
      "name: example",
      "description: Example",
      "related: commit-format",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`related`"))).toBe(true);
  });

  it("rejects `name` that does not match the file basename", () => {
    const content = [
      "---",
      "name: commit-format",
      "description: Example",
      "override-active: false",
      "---",
      "",
    ].join("\n");
    const result = parseMethodFrontmatter(content, "issue-triage");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("issue-triage"))).toBe(true);
  });

  it("surfaces a missing-frontmatter diagnostic when no triple-dash block", () => {
    const result = parseMethodFrontmatter("# body only\n", "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /frontmatter/.test(e))).toBe(true);
  });

  it("surfaces malformed-YAML errors through the schema parser", () => {
    const content = "---\nname: [unterminated\n---\n";
    const result = parseMethodFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /YAML|yaml/.test(e))).toBe(true);
  });

  it("rejects an array-rooted YAML document with a mapping diagnostic", () => {
    const content = "---\n- one\n- two\n---\n";
    const result = parseMethodFrontmatter(content, "example");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors).toEqual(["frontmatter must be a YAML mapping"]);
  });
});
