import { describe, it, expect } from "vitest";
import { renderTokens, renderConditionals } from "../../../src/lib/template/index.js";

describe("renderTokens", () => {
  it("replaces a single token", () => {
    const result = renderTokens("Hello {{PROJECT_NAME}}!", {
      PROJECT_NAME: "My App",
    });
    expect(result).toBe("Hello My App!");
  });

  it("replaces multiple different tokens", () => {
    const result = renderTokens(
      "{{PROJECT_NAME}} uses {{BASE_BRANCH}} branch",
      { PROJECT_NAME: "My App", BASE_BRANCH: "main" },
    );
    expect(result).toBe("My App uses main branch");
  });

  it("replaces a token that appears multiple times", () => {
    const result = renderTokens(
      "{{INSTALL_DIR}}/config and {{INSTALL_DIR}}/docs",
      { INSTALL_DIR: "framework" },
    );
    expect(result).toBe("framework/config and framework/docs");
  });

  it("passes through content with no tokens", () => {
    const result = renderTokens("No tokens here.", {
      PROJECT_NAME: "unused",
    });
    expect(result).toBe("No tokens here.");
  });

  it("leaves unknown tokens as-is", () => {
    const result = renderTokens("Hello {{UNKNOWN_TOKEN}}!", {
      PROJECT_NAME: "My App",
    });
    expect(result).toBe("Hello {{UNKNOWN_TOKEN}}!");
  });
});

describe("renderConditionals", () => {
  it("includes section when condition is true", () => {
    const input = [
      "before",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "included content",
      "<!-- arc:endif -->",
      "after",
    ].join("\n");
    const result = renderConditionals(input, { "pm.mode": "arc-in-git" });
    expect(result).toBe("before\nincluded content\nafter");
  });

  it("excludes section when condition is false", () => {
    const input = [
      "before",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "excluded content",
      "<!-- arc:endif -->",
      "after",
    ].join("\n");
    const result = renderConditionals(input, { "pm.mode": "none" });
    expect(result).toBe("before\nafter");
  });

  it("collapses multiple blank lines left by stripped blocks", () => {
    const input = [
      "before",
      "",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "",
      "### Conditional Heading",
      "",
      "Conditional content",
      "",
      "<!-- arc:endif -->",
      "",
      "after",
    ].join("\n");
    const result = renderConditionals(input, { "pm.mode": "none" });
    expect(result).toBe("before\n\nafter");
  });

  it("handles nested conditionals", () => {
    const input = [
      "top",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "outer",
      "<!-- arc:if team.mode == true -->",
      "inner",
      "<!-- arc:endif -->",
      "outer-after",
      "<!-- arc:endif -->",
      "bottom",
    ].join("\n");
    // Both conditions true — all included
    expect(
      renderConditionals(input, { "pm.mode": "arc-in-git", "team.mode": "true" }),
    ).toBe("top\nouter\ninner\nouter-after\nbottom");
    // Outer true, inner false — inner excluded
    expect(
      renderConditionals(input, { "pm.mode": "arc-in-git", "team.mode": "false" }),
    ).toBe("top\nouter\nouter-after\nbottom");
    // Outer false — everything inside excluded
    expect(
      renderConditionals(input, { "pm.mode": "none", "team.mode": "true" }),
    ).toBe("top\nbottom");
  });

  it("handles multiple independent conditions", () => {
    const input = [
      "start",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "pm section",
      "<!-- arc:endif -->",
      "middle",
      "<!-- arc:if team.mode == true -->",
      "team section",
      "<!-- arc:endif -->",
      "end",
    ].join("\n");
    const result = renderConditionals(input, {
      "pm.mode": "arc-in-git",
      "team.mode": "false",
    });
    expect(result).toBe("start\npm section\nmiddle\nend");
  });

  it("passes through content with no conditionals", () => {
    const input = "no conditionals here\njust text";
    const result = renderConditionals(input, { "pm.mode": "arc-in-git" });
    expect(result).toBe("no conditionals here\njust text");
  });

  it("includes section when != condition is true (values differ)", () => {
    const input = [
      "before",
      "<!-- arc:if pm.mode != none -->",
      "included content",
      "<!-- arc:endif -->",
      "after",
    ].join("\n");
    const result = renderConditionals(input, { "pm.mode": "arc-in-git" });
    expect(result).toBe("before\nincluded content\nafter");
  });

  it("excludes section when != condition is false (values match)", () => {
    const input = [
      "before",
      "<!-- arc:if pm.mode != none -->",
      "excluded content",
      "<!-- arc:endif -->",
      "after",
    ].join("\n");
    const result = renderConditionals(input, { "pm.mode": "none" });
    expect(result).toBe("before\nafter");
  });

  it("handles != with nested conditionals", () => {
    const input = [
      "top",
      "<!-- arc:if pm.mode != none -->",
      "outer",
      "<!-- arc:if team.mode == true -->",
      "inner",
      "<!-- arc:endif -->",
      "<!-- arc:endif -->",
      "bottom",
    ].join("\n");
    // != true, inner == true
    expect(
      renderConditionals(input, { "pm.mode": "arc-in-git", "team.mode": "true" }),
    ).toBe("top\nouter\ninner\nbottom");
    // != true, inner == false
    expect(
      renderConditionals(input, { "pm.mode": "arc-in-git", "team.mode": "false" }),
    ).toBe("top\nouter\nbottom");
    // != false (values match) — everything inside excluded
    expect(
      renderConditionals(input, { "pm.mode": "none", "team.mode": "true" }),
    ).toBe("top\nbottom");
  });

  it("existing == behavior unchanged alongside !=", () => {
    const input = [
      "start",
      "<!-- arc:if pm.mode == arc-in-git -->",
      "equals section",
      "<!-- arc:endif -->",
      "middle",
      "<!-- arc:if pm.mode != none -->",
      "not-equals section",
      "<!-- arc:endif -->",
      "end",
    ].join("\n");
    // Both true
    expect(
      renderConditionals(input, { "pm.mode": "arc-in-git" }),
    ).toBe("start\nequals section\nmiddle\nnot-equals section\nend");
    // == false, != true
    expect(
      renderConditionals(input, { "pm.mode": "external" }),
    ).toBe("start\nmiddle\nnot-equals section\nend");
    // == false, != false
    expect(
      renderConditionals(input, { "pm.mode": "none" }),
    ).toBe("start\nmiddle\nend");
  });
});
