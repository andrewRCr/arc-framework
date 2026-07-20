import { lint } from "markdownlint/promise";
import { describe, expect, it } from "vitest";

import { transformGfmTables } from "../../../src/lib/markdown/index.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

describe("GFM table transformation", () => {
  it("rewrites only top-level table ranges while retaining GFM cell semantics", async () => {
    const content = [
      "Before 表.",
      "",
      "| Name | Value |",
      "| - | - |",
      "| A \\| B | `x\\|y` and *z* |",
      "",
      "After é without final newline.",
    ].join("\r\n");
    const result = transformGfmTables({ path: "docs/table.md", bytes: encoder.encode(content) });
    const output = decoder.decode(result.bytes);
    const lintResults = await lint({
      strings: { "docs/table.md": output },
      config: { default: false, MD060: { style: "aligned" } },
    });

    expect(result.changedRanges).toHaveLength(1);
    expect(output.startsWith("Before 表.\r\n\r\n")).toBe(true);
    expect(output.endsWith("\r\n\r\nAfter é without final newline.")).toBe(true);
    expect(output).toContain("A \\| B");
    expect(output).toContain("`x\\|y` and *z*");
    expect(lintResults["docs/table.md"]).toEqual([]);
    expect(transformGfmTables({ path: "docs/table.md", bytes: result.bytes }).bytes).toEqual(result.bytes);
  });

  it("restores consistent ordered-list and block-quote container prefixes", () => {
    const content = [
      "1. Context",
      "",
      "   | Wide | Value |",
      "   | - | - |",
      "   | 表 | one |",
      "",
      "- Context",
      "",
      "  | Combining | Value |",
      "  | - | - |",
      "  | é | two |",
      "",
      "> | Emoji | Value |",
      "> | - | - |",
      "> | 👩‍💻 | three |",
      "",
    ].join("\n");
    const result = transformGfmTables({ path: "docs/nested.md", bytes: encoder.encode(content) });
    const output = decoder.decode(result.bytes);

    expect(result.changedRanges).toHaveLength(3);
    expect(output).toMatch(/\n {3}\|/u);
    expect(output).toMatch(/\n {2}\|/u);
    expect(output).toMatch(/\n> \|/u);
    expect(transformGfmTables({ path: "docs/nested.md", bytes: result.bytes }).bytes).toEqual(result.bytes);
  });

  it("rejects an inconsistent nested prefix with path and line context", () => {
    const content = "> | A |\n>| - |\n> | value |\n";

    expect(() => transformGfmTables({ path: "docs/broken.md", bytes: encoder.encode(content) })).toThrowError(
      expect.objectContaining({
        code: "markdown.table-container",
        message: expect.stringContaining("docs/broken.md:1"),
      }),
    );
  });

  it("rejects malformed UTF-8 before parsing", () => {
    expect(() => transformGfmTables({
      path: "docs/invalid.md",
      bytes: Uint8Array.from([0x7c, 0x20, 0xff, 0x20, 0x7c]),
    })).toThrowError(expect.objectContaining({ code: "markdown.invalid-utf8" }));
  });

  it("preserves an initial BOM and non-ASCII bytes outside changed table ranges", () => {
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);
    const content = "Préface\n\n| A |\n| - |\n| 表 |\n\nFin 👩‍💻";
    const bytes = new Uint8Array(bom.length + encoder.encode(content).length);
    bytes.set(bom);
    bytes.set(encoder.encode(content), bom.length);
    const result = transformGfmTables({ path: "docs/bom.md", bytes });

    expect([...result.bytes.slice(0, 3)]).toEqual([...bom]);
    expect(decoder.decode(result.bytes).endsWith("\n\nFin 👩‍💻")).toBe(true);
  });

  it("returns a byte-identical no-op for a document without tables", () => {
    const bytes = encoder.encode("# Heading\r\n\r\nPlain 表 text.");
    const result = transformGfmTables({ path: "docs/plain.md", bytes });

    expect(result.bytes).toEqual(bytes);
    expect(result.changedRanges).toEqual([]);
  });
});
