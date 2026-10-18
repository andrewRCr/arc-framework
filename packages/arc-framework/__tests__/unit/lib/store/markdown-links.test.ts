/** Stored Markdown syntax preserves the source locations used in write refusals. */
import { describe, expect, it } from "vitest";
import { readMarkdownLinks } from "../../../../src/lib/store/kinds/markdown-links.js";

describe("stored Markdown links", () => {
  it("reads link, image, and definition URLs with source locations", () => {
    expect(readMarkdownLinks("[guide](/guide.md) ![logo](logo.png)\n\n[ref]: ../README.md\n").links).toEqual([
      { value: "/guide.md", line: 1, column: 1 },
      { value: "logo.png", line: 1, column: 20 },
      { value: "../README.md", line: 3, column: 1 },
    ]);
  });
  it("finds undefined full references using CommonMark labels and stored positions", () => {
    const content = "ok [yes][known]\n\n[known]: /README.md\n\nPrefix [text][  MiSSing\t Label ] and [x][other].\n";
    expect(readMarkdownLinks(content).undefinedReferences).toEqual([
      { value: "MISSING LABEL", line: 5, column: 8 },
      { value: "OTHER", line: 5, column: 38 },
    ]);
    expect(readMarkdownLinks("[x][known]\n").undefinedReferences).toEqual([
      { value: "KNOWN", line: 1, column: 1 },
    ]);
  });
  it("normalizes multiline labels like definitions", () => {
    expect(readMarkdownLinks("[x][un\n known]\n").undefinedReferences).toEqual([
      { value: "UN KNOWN", line: 1, column: 1 },
    ]);
    expect(readMarkdownLinks("[x][ϴ]\n\n[θ]: /README.md\n").undefinedReferences).toEqual([]);
  });
  it.each([
    "`[x][code]`", "```md\n[x][fence]\n```", "    [x][indented]",
    '<div data-value="[x][html]">', '[link]("[x][destination]")',
    "[text *format*][split]", "[^footnote]\n\n[^footnote]: a footnote",
    "\\[x][escaped]", "[collapsed][] [shortcut]",
  ])("keeps nonreferences out of the undefined set: %s", content => {
    expect(readMarkdownLinks(content).undefinedReferences).toEqual([]);
  });
});
