/**
 * Unit tests for the DEV-RULES domain-file frontmatter schema parser.
 *
 * Covers required-field presence (domain, purpose), type validation,
 * non-empty `purpose`, filename-to-domain matching (case-insensitive),
 * and forward-compatible extra keys.
 */

import { describe, it, expect } from "vitest";

import { parseDevRulesFrontmatter } from "../../../src/lib/frontmatter/dev-rules.js";

const validFrontend = [
  "---",
  "domain: frontend",
  "purpose: UI component and styling standards",
  "---",
  "",
].join("\n");

describe("parseDevRulesFrontmatter", () => {
  it("returns the typed frontmatter with no errors when all fields are valid", () => {
    const result = parseDevRulesFrontmatter(validFrontend, "DEV-RULES.FRONTEND");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({
      domain: "frontend",
      purpose: "UI component and styling standards",
    });
  });

  it("reports a diagnostic naming the missing `domain` field", () => {
    const content = [
      "---",
      "purpose: UI component and styling standards",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`domain`"))).toBe(true);
  });

  it("reports a diagnostic naming the missing `purpose` field", () => {
    const content = [
      "---",
      "domain: frontend",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`purpose`"))).toBe(true);
  });

  it("rejects non-string `domain` as a type mismatch", () => {
    const content = [
      "---",
      "domain: 42",
      "purpose: UI component and styling standards",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`domain`") && /string/.test(e))).toBe(true);
  });

  it("rejects non-string `purpose` as a type mismatch", () => {
    const content = [
      "---",
      "domain: frontend",
      "purpose: 42",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`purpose`") && /string/.test(e))).toBe(true);
  });

  it("rejects an empty-string `purpose` as non-empty required", () => {
    const content = [
      "---",
      "domain: frontend",
      'purpose: ""',
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("`purpose`") && /empty|non-empty/i.test(e))).toBe(true);
  });

  it("rejects `domain` that does not match the filename `{DOMAIN}` fragment", () => {
    const content = [
      "---",
      "domain: security",
      "purpose: UI component and styling standards",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => e.includes("security") && e.includes("FRONTEND"))).toBe(true);
  });

  it("rejects a lowercase filename fragment (uppercase required for signal)", () => {
    const result = parseDevRulesFrontmatter(validFrontend, "DEV-RULES.frontend");
    expect(result.frontmatter).toBeUndefined();
    expect(
      result.errors.some((e) => /uppercase/i.test(e) && e.includes("frontend")),
    ).toBe(true);
  });

  it("rejects a mixed-case filename fragment", () => {
    const result = parseDevRulesFrontmatter(validFrontend, "DEV-RULES.Frontend");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /uppercase/i.test(e))).toBe(true);
  });

  it("rejects an uppercase `domain:` value (lowercase required — identifiers, not labels)", () => {
    const content = [
      "---",
      "domain: FRONTEND",
      "purpose: UI component and styling standards",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(
      result.errors.some((e) => /lowercase/i.test(e) && e.includes("FRONTEND")),
    ).toBe(true);
  });

  it("rejects a mixed-case `domain:` value", () => {
    const content = [
      "---",
      "domain: Frontend",
      "purpose: UI component and styling standards",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /lowercase/i.test(e))).toBe(true);
  });

  it("surfaces a missing-frontmatter diagnostic when no triple-dash block", () => {
    const result = parseDevRulesFrontmatter("# body only\n", "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /frontmatter/.test(e))).toBe(true);
  });

  it("surfaces malformed-YAML errors through the schema parser", () => {
    const content = "---\ndomain: [unterminated\n---\n";
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /YAML|yaml/.test(e))).toBe(true);
  });

  it("rejects non-mapping YAML (top-level array) with a mapping-required diagnostic", () => {
    const content = [
      "---",
      "- domain: frontend",
      "- purpose: UI",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.frontmatter).toBeUndefined();
    expect(result.errors.some((e) => /mapping/i.test(e))).toBe(true);
  });

  it("accepts extra unknown keys for forward-compatibility", () => {
    const content = [
      "---",
      "domain: frontend",
      "purpose: UI component and styling standards",
      "owner: ui-team",
      "reviewed: 2026-04-23",
      "---",
      "",
    ].join("\n");
    const result = parseDevRulesFrontmatter(content, "DEV-RULES.FRONTEND");
    expect(result.errors).toEqual([]);
    expect(result.frontmatter).toEqual({
      domain: "frontend",
      purpose: "UI component and styling standards",
    });
  });
});
