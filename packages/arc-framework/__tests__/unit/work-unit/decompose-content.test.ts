import { describe, expect, it } from "vitest";

import {
  resolveDecomposeContentLocator,
  scanDecomposeContent,
} from "../../../src/lib/work-unit/decompose-content.js";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("scanDecomposeContent", () => {
  it("splits Markdown into a preamble and top-level H2 sections with descendants", () => {
    const result = scanDecomposeContent("draft-sample.md", bytes("intro\n\n## First\nbody\n### Child\nchild\n## Second\nend\n"));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "preamble" },
      { artifact: "draft-sample.md", kind: "section", headingSource: "First", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Second", occurrence: 0 },
    ]);
    expect(result.units.map((unit) => unit.content)).toEqual([
      "intro\n\n",
      "## First\nbody\n### Child\nchild\n",
      "## Second\nend\n",
    ]);
  });

  it("uses one preamble when Markdown has no H2 and one whole-file unit for non-Markdown", () => {
    const markdown = scanDecomposeContent("notes-sample.md", bytes("# Notes\nEverything.\n"));
    const binary = scanDecomposeContent("research.json", bytes('{"answer":42}\n'));

    expect(markdown).toMatchObject({
      status: "scanned",
      units: [{ locator: { artifact: "notes-sample.md", kind: "preamble" }, content: "# Notes\nEverything.\n" }],
    });
    expect(binary).toMatchObject({
      status: "scanned",
      units: [{ locator: { artifact: "research.json", kind: "whole-file" }, content: '{"answer":42}\n' }],
    });
  });

  it("recognizes ATX and Setext H2 outside fences without treating fenced headings as sections", () => {
    const source = [
      "before",
      "```md",
      "## Not a heading",
      "Fake Setext",
      "---",
      "```",
      "Setext *source*",
      "----------------",
      "body",
      "## ATX ##",
      "end",
      "",
    ].join("\n");
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "preamble" },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Setext *source*", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "ATX", occurrence: 0 },
    ]);
  });

  it("does not promote fence delimiters or nested block content to top-level Setext sections", () => {
    const source = [
      "```md",
      "fenced",
      "```",
      "---",
      "> quoted",
      "---",
      "- list item",
      "---",
      "## Real",
      "body",
      "",
    ].join("\n");
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "preamble" },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Real", occurrence: 0 },
    ]);
  });

  it("excludes container-nested ATX H2s while recognizing immediate top-level exits", () => {
    const source = [
      "- list item",
      "  ## Nested in list",
      "  nested body",
      " ## Top after list",
      "top body",
      "1. ordered item",
      "   ## Nested in ordered list",
      "  ## Top after ordered list",
      "> quoted",
      "> ## Nested in quote",
      " ## Top after quote",
      "- list with blank",
      "",
      "  ## Nested after blank",
      "  nested body",
      "## Final top level",
      "end",
      "",
    ].join("\n");
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "Top after list", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Top after ordered list", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Top after quote", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "Final top level", occurrence: 0 },
    ]);
  });

  it("uses the complete top-level paragraph as a multiline Setext heading", () => {
    const source = "intro\n\nFirst *line*\nsecond `line`\n---\nbody\n";
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "preamble" },
      {
        artifact: "draft-sample.md",
        kind: "section",
        headingSource: "First *line*\nsecond `line`",
        occurrence: 0,
      },
    ]);
    expect(result.units[1]?.content).toBe("First *line*\nsecond `line`\n---\nbody\n");
  });

  it("does not turn non-paragraph block content into top-level Setext headings", () => {
    const source = [
      "# H1",
      "---",
      "    indented code",
      "---",
      "[reference]: /target",
      "---",
      "> quoted",
      "lazy quote continuation",
      "---",
      "",
      "- list item",
      "lazy list continuation",
      "---",
      "",
      "<div>",
      "html block content",
      "---",
      "</div>",
      "",
      "Real paragraph",
      "---",
      "body",
      "",
    ].join("\n");
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "Real paragraph", occurrence: 0 },
    ]);
  });

  it("normalizes heading source and numbers equal normalized headings from zero", () => {
    const source = "##  A\t e\u0301 **bold**  ##\nfirst\n## A   é **bold**\nsecond\n";
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "A é **bold**", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "A é **bold**", occurrence: 1 },
    ]);
  });

  it("inventories and resolves bare H2 sections with an empty normalized heading source", () => {
    const result = scanDecomposeContent("draft-sample.md", bytes("##\nfirst\n##   \nsecond\n"));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "", occurrence: 0 },
      { artifact: "draft-sample.md", kind: "section", headingSource: "", occurrence: 1 },
    ]);
    expect(resolveDecomposeContentLocator(
      result.units,
      { artifact: "draft-sample.md", kind: "section", headingSource: "", occurrence: 1 },
      "draft-sample.md",
    )).toMatchObject({ status: "resolved", unit: { content: "##   \nsecond\n" } });
  });

  it("rejects invalid UTF-8 Markdown and slash-bearing artifact locators", () => {
    expect(scanDecomposeContent("draft-sample.md", new Uint8Array([0xc3, 0x28]))).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/UTF-8/i),
    });
    expect(scanDecomposeContent("path/draft-sample.md", bytes("text"))).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/basename/i),
    });
    for (const artifact of [".", "..", "draft\0sample.md"]) {
      expect(scanDecomposeContent(artifact, bytes("text"))).toMatchObject({
        status: "rejected",
        reason: expect.stringMatching(/basename/i),
      });
    }
  });
});

describe("resolveDecomposeContentLocator", () => {
  it("resolves exactly one matching locator and rejects kind, occurrence, and artifact mismatches", () => {
    const scan = scanDecomposeContent("draft-sample.md", bytes("## Same\none\n## Same\ntwo\n"));
    expect(scan.status).toBe("scanned");
    if (scan.status !== "scanned") return;

    expect(
      resolveDecomposeContentLocator(
        scan.units,
        { artifact: "draft-sample.md", kind: "section", headingSource: "Same", occurrence: 1 },
        "draft-sample.md",
      ),
    ).toMatchObject({ status: "resolved", unit: { content: "## Same\ntwo\n" } });
    expect(
      resolveDecomposeContentLocator(scan.units, { artifact: "draft-sample.md", kind: "whole-file" }, "draft-sample.md"),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/kind|resolve/i) });
    expect(
      resolveDecomposeContentLocator(
        scan.units,
        { artifact: "draft-sample.md", kind: "section", headingSource: "Same", occurrence: -1 },
        "draft-sample.md",
      ),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/occurrence/i) });
    expect(
      resolveDecomposeContentLocator(scan.units, { artifact: "draft-other.md", kind: "preamble" }, "draft-sample.md"),
    ).toMatchObject({ status: "rejected", reason: expect.stringMatching(/artifact/i) });
  });
});
