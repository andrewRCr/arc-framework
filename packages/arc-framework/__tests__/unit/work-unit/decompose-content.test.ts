import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  resolveDecomposeContentLocator,
  resolveV3DecomposeContentLocator,
  resolveV3DecomposeSourceUnit,
  scanDecomposeContent,
  scanV3DecomposeContent,
} from "../../../src/lib/work-unit/decompose-content.js";
import { v3SourceId } from "../../../src/lib/work-unit/decompose-v3-schema.js";

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

  it("does not open a backtick fence whose info string contains a backtick", () => {
    const source = "```md`invalid\n## Visible\n```\n";
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "Visible", occurrence: 0 },
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

  it("does not promote a multiline reference-definition title to a Setext section", () => {
    const source = "[reference]: /target\n  \"optional title\"\n---\n## Real\nbody\n";
    const result = scanDecomposeContent("draft-sample.md", bytes(source));

    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    expect(result.units.slice(1).map((unit) => unit.locator)).toEqual([
      { artifact: "draft-sample.md", kind: "section", headingSource: "Real", occurrence: 0 },
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

describe("scanV3DecomposeContent", () => {
  it("emits disjoint H2-H6 units with hierarchy-qualified locators", () => {
    const source = "## Parent\nlead\n#### Deep\nbody\n### Child\nbody\n## Parent\nagain\n";
    const result = scanV3DecomposeContent("draft-sample.md", bytes(source));
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.map(({ locator }) => locator)).toEqual([
      { artifact: "draft-sample.md", kind: "preamble" },
      {
        artifact: "draft-sample.md",
        kind: "section",
        level: 2,
        headingSource: "Parent",
        ancestry: [],
        occurrence: 0,
      },
      {
        artifact: "draft-sample.md",
        kind: "section",
        level: 4,
        headingSource: "Deep",
        ancestry: [{ level: 2, headingSource: "Parent", occurrence: 0 }],
        occurrence: 0,
      },
      {
        artifact: "draft-sample.md",
        kind: "section",
        level: 3,
        headingSource: "Child",
        ancestry: [{ level: 2, headingSource: "Parent", occurrence: 0 }],
        occurrence: 0,
      },
      {
        artifact: "draft-sample.md",
        kind: "section",
        level: 2,
        headingSource: "Parent",
        ancestry: [],
        occurrence: 1,
      },
    ]);
    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(bytes(source)));
  });

  it("preserves UTF-8 BOM and multibyte stored bytes exactly", () => {
    const source = "\uFEFFpréface\n## Héading\n😀\n";
    const original = bytes(source);
    const result = scanV3DecomposeContent("draft-sample.md", original);
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(original));
  });

  it("keeps an initial BOM in preamble bytes while recognizing the first heading", () => {
    for (const source of [
      "\uFEFF## First\r\nbody\r\n",
      "\uFEFFFirst\r\n-----\r\nbody\r\n",
    ]) {
      const original = bytes(source);
      const result = scanV3DecomposeContent("draft-sample.md", original);
      expect(result.status).toBe("scanned");
      if (result.status !== "scanned") continue;

      expect(result.units.map(({ locator }) => locator.kind)).toEqual(["preamble", "section"]);
      expect(result.units[0]?.content).toBe("\uFEFF");
      expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
        .toEqual(Buffer.from(original));
    }
  });

  it("keeps preamble, parent lead, and nested CRLF units disjoint over original bytes", () => {
    const source = [
      "\uFEFFpréface",
      "",
      "## Parent",
      "lead 😀",
      "### Child",
      "child",
      "##### Jump",
      "deep",
      "###### Bottom",
      "bottom",
      "",
    ].join("\r\n");
    const original = bytes(source);
    const result = scanV3DecomposeContent("draft-sample.md", original);
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.map(({ content }) => content)).toEqual([
      "\uFEFFpréface\r\n\r\n",
      "## Parent\r\nlead 😀\r\n",
      "### Child\r\nchild\r\n",
      "##### Jump\r\ndeep\r\n",
      "###### Bottom\r\nbottom\r\n",
    ]);
    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(original));
  });

  it("scopes repeated sibling occurrences by structural parent identity", () => {
    const source = [
      "## a",
      "### b",
      "#### Same",
      "one",
      `## a:0\u00003:b`,
      "#### Same",
      "two",
      "",
    ].join("\n");
    const result = scanV3DecomposeContent("draft-sample.md", bytes(source));
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units
      .filter(({ locator }) => locator.kind === "section" && locator.headingSource === "Same")
      .map(({ locator }) => locator.kind === "section" ? locator.occurrence : -1))
      .toEqual([0, 0]);
  });

  it("resets hierarchy ancestry across an intervening H1 without losing bytes", () => {
    const source = "## Parent\nlead\n# New root\nroot lead\n### Child\nbody\n";
    const original = bytes(source);
    const result = scanV3DecomposeContent("draft-sample.md", original);
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.map(({ content }) => content)).toEqual([
      "",
      "## Parent\nlead\n# New root\nroot lead\n",
      "### Child\nbody\n",
    ]);
    expect(result.units.at(-1)?.locator).toMatchObject({
      kind: "section",
      headingSource: "Child",
      ancestry: [],
    });
    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(original));
  });

  it("keeps incidental headings inside fences, HTML, quotes, and lists", () => {
    const source = [
      "```md",
      "### fenced",
      "```",
      "<div>",
      "#### html",
      "</div>",
      "",
      "> ##### quoted",
      "",
      "- item",
      "  ###### listed",
      "",
      "## Real",
      "lead",
      "### Child",
      "body",
      "",
    ].join("\n");
    const original = bytes(source);
    const result = scanV3DecomposeContent("draft-sample.md", original);
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.slice(1).map(({ locator }) =>
      locator.kind === "section" ? locator.headingSource : locator.kind))
      .toEqual(["Real", "Child"]);
    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(original));
  });

  it("uses exact preamble and whole-file units when no H2-H6 boundary exists", () => {
    const markdown = bytes("# Root\ntext 😀\r\n");
    const binary = new Uint8Array([0xff, 0x00, 0x7f]);
    expect(scanV3DecomposeContent("notes-sample.md", markdown)).toEqual({
      status: "scanned",
      units: [{
        locator: { artifact: "notes-sample.md", kind: "preamble" },
        content: "# Root\ntext 😀\r\n",
        bytes: markdown,
      }],
    });
    expect(scanV3DecomposeContent("payload.bin", binary)).toEqual({
      status: "scanned",
      units: [{
        locator: { artifact: "payload.bin", kind: "whole-file" },
        content: "\uFFFD\u0000\u007F",
        bytes: binary,
      }],
    });
  });

  it("resolves identical headings only under their exact parent identity", () => {
    const result = scanV3DecomposeContent(
      "draft-sample.md",
      bytes("## First\n### Same\none\n## Second\n### Same\ntwo\n"),
    );
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    const target = result.units.at(-1);
    expect(target).toBeDefined();
    if (target === undefined) return;

    expect(resolveV3DecomposeContentLocator(
      result.units,
      target.locator,
      "draft-sample.md",
    )).toEqual({ status: "resolved", unit: target });
    if (target.locator.kind !== "section") return;
    expect(resolveV3DecomposeContentLocator(
      result.units,
      {
        ...target.locator,
        ancestry: [{ level: 2, headingSource: "Missing", occurrence: 0 }],
      },
      "draft-sample.md",
    )).toMatchObject({ status: "rejected" });
  });

  it("projects untrusted locators canonically and refuses every wrong component at its source locus", () => {
    const result = scanV3DecomposeContent(
      "draft-sample.md",
      bytes("## Parent\n### Same\none\n### Same\ntwo\n"),
    );
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;
    const target = result.units.at(-1);
    expect(target?.locator.kind).toBe("section");
    if (target === undefined || target.locator.kind !== "section") return;

    const reordered = {
      occurrence: target.locator.occurrence,
      ancestry: target.locator.ancestry,
      headingSource: target.locator.headingSource,
      level: target.locator.level,
      kind: target.locator.kind,
      artifact: target.locator.artifact,
    };
    expect(resolveV3DecomposeContentLocator(
      result.units,
      reordered,
      "draft-sample.md",
    )).toEqual({ status: "resolved", unit: target });

    for (const locator of [
      { ...target.locator, level: 4 },
      { ...target.locator, occurrence: 99 },
      {
        ...target.locator,
        ancestry: [{ ...target.locator.ancestry[0]!, headingSource: "Other" }],
      },
    ]) {
      expect(resolveV3DecomposeContentLocator(
        result.units,
        locator,
        "draft-sample.md",
      )).toMatchObject({
        status: "rejected",
        locus: expect.stringContaining("draft-sample.md"),
      });
    }
    expect(resolveV3DecomposeContentLocator(
      [...result.units, target],
      target.locator,
      "draft-sample.md",
    )).toMatchObject({ status: "rejected", reason: expect.stringMatching(/2 times/) });
    expect(resolveV3DecomposeContentLocator(
      result.units,
      { ...target.locator, approval: "accepted" },
      "draft-sample.md",
    )).toMatchObject({ status: "rejected", reason: expect.stringMatching(/invalid/i) });
  });

  it("authenticates source identity and content state as separate bindings", () => {
    const sourcePath = ".arc/active/draft-sample.md";
    const original = bytes("## Parent\n### Child\nbody\n");
    const scan = scanV3DecomposeContent("draft-sample.md", original);
    expect(scan.status).toBe("scanned");
    if (scan.status !== "scanned") return;
    const unit = scan.units.at(-1);
    expect(unit).toBeDefined();
    if (unit === undefined) return;
    const reference = {
      sourcePath,
      sourceLocator: unit.locator,
      sourceId: v3SourceId({ sourcePath, sourceLocator: unit.locator }),
      contentDigest: digestBytes(unit.bytes),
    };

    expect(resolveV3DecomposeSourceUnit(reference, original))
      .toEqual({ status: "resolved", unit });
    expect(resolveV3DecomposeSourceUnit(
      { ...reference, sourceId: digestBytes(bytes("other identity")) },
      original,
    )).toMatchObject({ status: "rejected", code: "source-id", locus: sourcePath });
    expect(resolveV3DecomposeSourceUnit(
      { ...reference, contentDigest: digestBytes(bytes("other content")) },
      original,
    )).toMatchObject({ status: "rejected", code: "source-content", locus: expect.stringContaining(sourcePath) });
    expect(resolveV3DecomposeSourceUnit(
      {
        ...reference,
        sourceLocator: {
          ...unit.locator,
          ...(unit.locator.kind === "section" ? { occurrence: 99 } : {}),
        },
      },
      original,
    )).toMatchObject({ status: "rejected", code: "source-id", locus: sourcePath });
  });

  it("changes identity on hierarchy movement but not on byte-only edits", () => {
    const sourcePath = ".arc/active/draft-sample.md";
    const underFirst = scanV3DecomposeContent(
      "draft-sample.md",
      bytes("## First\n### Child\nbody\n"),
    );
    const underSecond = scanV3DecomposeContent(
      "draft-sample.md",
      bytes("## Second\n### Child\nbody\n"),
    );
    const edited = scanV3DecomposeContent(
      "draft-sample.md",
      bytes("## First\n### Child\nedited body\n"),
    );
    expect(underFirst.status).toBe("scanned");
    expect(underSecond.status).toBe("scanned");
    expect(edited.status).toBe("scanned");
    if (underFirst.status !== "scanned"
      || underSecond.status !== "scanned"
      || edited.status !== "scanned") return;
    const firstChild = underFirst.units.at(-1);
    const secondChild = underSecond.units.at(-1);
    const editedChild = edited.units.at(-1);
    expect(firstChild).toBeDefined();
    expect(secondChild).toBeDefined();
    expect(editedChild).toBeDefined();
    if (firstChild === undefined || secondChild === undefined || editedChild === undefined) return;

    const identity = (locator: typeof firstChild.locator) =>
      v3SourceId({ sourcePath, sourceLocator: locator });
    expect(identity(firstChild.locator)).not.toBe(identity(secondChild.locator));
    expect(identity(firstChild.locator)).toBe(identity(editedChild.locator));
    expect(digestBytes(firstChild.bytes)).not.toBe(digestBytes(editedChild.bytes));
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
