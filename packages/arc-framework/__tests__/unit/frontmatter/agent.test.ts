/**
 * Unit tests for the agent-file frontmatter schema parser.
 *
 * Agent files ({AGENT}.ARC.md) carry only `active: boolean` — no `name`,
 * `description`, or `related`. Validates presence and type of `active`, plus
 * passthrough of generic-layer errors (missing block, malformed YAML).
 */

import { describe, it, expect } from "vitest";

import { parseAgentFrontmatter } from "../../../src/lib/frontmatter/agent.js";

describe("parseAgentFrontmatter", () => {
  it("returns the typed frontmatter with no errors when `active: true`", () => {
    const content = "---\nactive: true\n---\n";
    const result = parseAgentFrontmatter(content);
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({ active: true });
  });

  it("returns the typed frontmatter with no errors when `active: false`", () => {
    const content = "---\nactive: false\n---\n";
    const result = parseAgentFrontmatter(content);
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({ active: false });
  });

  it("reports a diagnostic naming the missing `active` field", () => {
    const content = "---\nunrelated: field\n---\n";
    const result = parseAgentFrontmatter(content);
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`active`"))).toBe(true);
  });

  it("rejects non-boolean `active` as a type mismatch", () => {
    const content = "---\nactive: \"true\"\n---\n";
    const result = parseAgentFrontmatter(content);
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`active`"))).toBe(true);
  });

  it("ignores extra fields — agent schema only requires `active`", () => {
    const content = [
      "---",
      "active: true",
      "name: whatever",
      "description: whatever",
      "---",
      "",
    ].join("\n");
    const result = parseAgentFrontmatter(content);
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({ active: true });
  });

  it("surfaces a missing-frontmatter diagnostic when no triple-dash block", () => {
    const result = parseAgentFrontmatter("# body only\n");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /frontmatter/.test(e))).toBe(true);
  });

  it("surfaces malformed-YAML errors through the schema parser", () => {
    const content = "---\nactive: [unterminated\n---\n";
    const result = parseAgentFrontmatter(content);
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /YAML|yaml/.test(e))).toBe(true);
  });
});
