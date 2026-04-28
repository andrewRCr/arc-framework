/**
 * Unit tests for arc-config.yml parsing.
 *
 * Tests parseArcConfig hardening: quote stripping, CRLF normalization,
 * and edge cases matching shell-side arc_config_get behavior.
 */

import { describe, it, expect } from "vitest";
import { parseArcConfig } from "../../src/lib/config/index.js";

describe("parseArcConfig", () => {
  it("parses simple key-value pairs", () => {
    const config = parseArcConfig("branch.base: main\ncommit.format: conventional\n");
    expect(config["branch.base"]).toBe("main");
    expect(config["commit.format"]).toBe("conventional");
  });

  it("skips comment lines", () => {
    const config = parseArcConfig("# comment\nbranch.base: main\n");
    expect(config["branch.base"]).toBe("main");
    expect(Object.keys(config)).toHaveLength(1);
  });

  it("skips blank lines", () => {
    const config = parseArcConfig("\n\nbranch.base: main\n\n");
    expect(config["branch.base"]).toBe("main");
  });

  it("strips surrounding double quotes from values", () => {
    const config = parseArcConfig('hooks.meta_ref_patterns: "[Tt]ask [0-9]+"\n');
    expect(config["hooks.meta_ref_patterns"]).toBe("[Tt]ask [0-9]+");
  });

  it("strips surrounding single quotes from values", () => {
    const config = parseArcConfig("hooks.meta_ref_patterns: '[Tt]ask [0-9]+'\n");
    expect(config["hooks.meta_ref_patterns"]).toBe("[Tt]ask [0-9]+");
  });

  it("does not strip mismatched quotes", () => {
    const config = parseArcConfig("key: \"value'\n");
    expect(config["key"]).toBe("\"value'");
  });

  it("does not strip quotes that are not surrounding", () => {
    const config = parseArcConfig('key: some "quoted" text\n');
    expect(config["key"]).toBe('some "quoted" text');
  });

  it("normalizes CRLF to LF before parsing", () => {
    const config = parseArcConfig("branch.base: main\r\ncommit.format: conventional\r\n");
    expect(config["branch.base"]).toBe("main");
    expect(config["commit.format"]).toBe("conventional");
  });

  it("handles mixed line endings (CRLF and LF)", () => {
    const config = parseArcConfig("branch.base: main\r\ncommit.format: conventional\n");
    expect(config["branch.base"]).toBe("main");
    expect(config["commit.format"]).toBe("conventional");
  });

  it("does not strip inline comments (matches shell behavior)", () => {
    const config = parseArcConfig(
      "hooks.meta_ref_patterns: '[Tt]ask [0-9]+\\.[0-9]+|[Pp]hase [0-9]+' # regex\n",
    );
    // Shell-side arc_config_get does NOT strip inline comments.
    // After quote stripping, the value includes everything after the quotes.
    // This test documents current shell-aligned behavior.
    expect(config["hooks.meta_ref_patterns"]).toContain("[Tt]ask");
    expect(config["hooks.meta_ref_patterns"]).toContain("# regex");
  });

  it("skips empty values (matches shell default-fallthrough)", () => {
    const config = parseArcConfig("key:\n");
    expect(config["key"]).toBeUndefined();
  });

  it("skips whitespace-only values", () => {
    const config = parseArcConfig("key:   \n");
    expect(config["key"]).toBeUndefined();
  });

  it("preserves value with colons (e.g., regex patterns)", () => {
    const config = parseArcConfig("key: value:with:colons\n");
    expect(config["key"]).toBe("value:with:colons");
  });
});
