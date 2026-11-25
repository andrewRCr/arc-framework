import { describe, expect, it } from "vitest";
import { lint } from "markdownlint/promise";
import type { MarkdownItBaseToken } from "markdownlint";
import MarkdownIt from "markdown-it";
import { underwrapRule } from "../../../src/lib/markdown/underwrap.js";
import { transformMarkdownProse } from "../../../src/lib/markdown/prose-transform.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function expectNoUnderwrap(content: string, widths: { min: number; max: number }): Promise<void> {
  const result = await lint({ strings: { output: content }, customRules: [underwrapRule],
    markdownItFactory: () => {
      const parser = new MarkdownIt({ html: true });
      return { parse: (source, environment) => parser.parse(source, environment as Record<string, unknown>) as MarkdownItBaseToken[] };
    }, config: { default: false, ARC001: widths } });
  expect(result.output).toEqual([]);
}

describe("Markdown prose reflow", () => {
  it("refuses inconsistent list continuation prefixes and succeeds after their repair", () => {
    const widths = { min: 15, max: 20 };
    expect(() => transformMarkdownProse({ path: "notes.md", widths,
      bytes: encoder.encode("- one two three\n  four five six\nseven eight nine ten eleven\n") }))
      .toThrow("consistent continuation indent");
    const repaired = transformMarkdownProse({ path: "notes.md", widths,
      bytes: encoder.encode("- one two three\n  four five six\n  seven eight nine ten eleven\n") });
    expect(decoder.decode(repaired.bytes)).toBe("- one two three four\n  five six seven\n  eight nine ten\n  eleven\n");
  });

  it("retains a code span wider than the target rather than splitting its contents", async () => {
    const prefix = "a".repeat(20);
    const atom = "`one two three four five six seven eight nine ten`";
    const widths = { min: 25, max: 30 };
    const result = transformMarkdownProse({ path: "notes.md", widths, bytes: encoder.encode(`${prefix} ${atom} tail\n`) });
    const text = decoder.decode(result.bytes);
    expect(text).toBe(`${prefix}\n${atom}\ntail\n`);
    await expectNoUnderwrap(text, widths);
  });

  it.each(["`several words`", "``several `words` span``", "\u00a7 12.3.4.5.6"])(
    "keeps the complete protected expression %s together and passes underwrap", async atom => {
      const prefix = "a".repeat(20);
      const widths = { min: 25, max: 30 };
      const result = transformMarkdownProse({ path: "notes.md", widths,
        bytes: encoder.encode(`${prefix} ${atom} tail\n`) });
      const text = decoder.decode(result.bytes);
      expect(text).toBe(`${prefix}\n${atom} tail\n`);
      await expectNoUnderwrap(text, widths);
    });

  it("preserves an existing newline inside a code span while moving the complete span", async () => {
    const widths = { min: 15, max: 20 };
    const result = transformMarkdownProse({ path: "notes.md", widths,
      bytes: encoder.encode("start\n`two\nthree` words\n") });
    const text = decoder.decode(result.bytes);
    expect(text).toBe("start `two\nthree` words\n");
    await expectNoUnderwrap(text, widths);
  });

  it.each([
    ["heading", "# one two three four five six\n"],
    ["blockquote", "> one two three four five six\n"],
    ["indented code", "    one two three four five six\n"],
    ["unclosed fence", "```text\none two three four five six\n"],
    ["table", "| A | B |\n| --- | --- |\n| one two three four | five six seven eight |\n"],
    ["structural field", "**Owner:** one two three four five six\n"],
  ])("leaves %s bytes untouched", (_name, text) => {
    const bytes = encoder.encode(text);
    const result = transformMarkdownProse({ path: "notes.md", bytes, widths: { min: 10, max: 20 } });
    expect(result.bytes).toEqual(bytes);
    expect(result.changedRanges).toEqual([]);
  });

  it("leaves compliant paragraphs byte-identical even when another word could fit", () => {
    const bytes = encoder.encode("one two three\nfour five six\n");
    const result = transformMarkdownProse({ path: "notes.md", bytes, widths: { min: 10, max: 20 } });
    expect(result.bytes).toEqual(bytes);
    expect(result.changedRanges).toEqual([]);
  });

  it("selects a containing paragraph from its continuation line without rewrapping its neighbor", () => {
    const result = transformMarkdownProse({ path: "notes.md", line: 2, widths: { min: 15, max: 20 },
      bytes: encoder.encode("one two three\nfour five six seven eight\n\nalpha beta gamma delta epsilon zeta\n") });
    expect(decoder.decode(result.bytes)).toBe("one two three four\nfive six seven eight\n\nalpha beta gamma delta epsilon zeta\n");
  });

  it("measures wide Unicode by display columns and reports UTF-8 byte ranges", () => {
    const wide = "界".repeat(8);
    const result = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode(`${wide} one two three\n`) });
    expect(decoder.decode(result.bytes)).toBe(`${wide} one\ntwo three\n`);
    expect(result.changedRanges).toEqual([{ start: 0, end: 38 }]);
  });

  it("retains the initial BOM outside changed byte ranges", () => {
    const result = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode("\uFEFFone two three four five six seven eight\n") });
    expect(decoder.decode(result.bytes)).toBe("one two three four\nfive six seven eight\n");
    expect(result.bytes.subarray(0, 3)).toEqual(encoder.encode("\uFEFF"));
    expect(result.changedRanges).toEqual([{ start: 3, end: 42 }]);
  });

  it("retains CRLF line endings", () => {
    const result = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode("one two three four five six seven eight\r\n") });
    expect(decoder.decode(result.bytes)).toBe("one two three four\r\nfive six seven eight\r\n");
  });

  it("refuses invalid UTF-8 and succeeds after the source bytes are repaired", () => {
    expect(() => transformMarkdownProse({ path: "notes.md", bytes: new Uint8Array([255]) })).toThrow("valid UTF-8");
    const repaired = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode("one two three four five six seven eight\n") });
    expect(decoder.decode(repaired.bytes)).toBe("one two three four\nfive six seven eight\n");
  });

  it("retains the list marker and the existing continuation indentation", () => {
    const result = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode("- one two three\n    four five six seven eight\n") });
    expect(decoder.decode(result.bytes)).toBe("- one two three four\n    five six seven\n    eight\n");
  });

  it.each([0, 1, 999])("refuses line %i and succeeds with an eligible paragraph line", line => {
    const bytes = encoder.encode("# Heading\n\none two three four five six seven eight\n");
    expect(() => transformMarkdownProse({ path: "notes.md", bytes, line, widths: { min: 15, max: 20 } }))
      .toThrow("prose line");
    const repaired = transformMarkdownProse({ path: "notes.md", bytes, line: 3, widths: { min: 15, max: 20 } });
    expect(decoder.decode(repaired.bytes)).toBe("# Heading\n\none two three four\nfive six seven eight\n");
  });

  it.each(["  ", "\\", "<br>"])("preserves the explicit %j break while wrapping its adjacent prose", marker => {
    const result = transformMarkdownProse({ path: "notes.md", widths: { min: 15, max: 20 },
      bytes: encoder.encode(`one two three four five six${marker}\nseven eight nine ten eleven twelve\n`) });
    expect(decoder.decode(result.bytes)).toBe(`one two three four\nfive six${marker}\nseven eight nine ten\neleven twelve\n`);
  });

  it("refuses a new Markdown structure and succeeds after the prose is escaped", () => {
    const prefix = "a".repeat(20);
    expect(() => transformMarkdownProse({ path: "notes.md", bytes: encoder.encode(`${prefix} # heading words\n`),
      widths: { min: 15, max: 20 } })).toThrow("meaning changed");
    const repaired = transformMarkdownProse({ path: "notes.md", bytes: encoder.encode(`${prefix} \\# heading words\n`),
      widths: { min: 15, max: 20 } });
    expect(decoder.decode(repaired.bytes)).toBe(`${prefix}\n\\# heading words\n`);
  });

  it("greedily rewraps an overlong paragraph to the configured physical width", () => {
    const result = transformMarkdownProse({ path: "notes.md",
      bytes: encoder.encode("one two three four five six seven eight\n"), widths: { min: 15, max: 20 } });
    expect(decoder.decode(result.bytes)).toBe("one two three four\nfive six seven eight\n");
    expect(result.changedRanges).toEqual([{ start: 0, end: 39 }]);
  });
});
