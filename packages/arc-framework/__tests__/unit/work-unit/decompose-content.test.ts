import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  resolveV3DecomposeContentLocator,
  resolveV3DecomposeSourceUnit,
  scanV3DecomposeContent,
} from "../../../src/lib/work-unit/decompose-content.js";
import { v3SourceId } from "../../../src/lib/work-unit/decompose-v3-schema.js";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

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

  it("emits task-list preamble and H2 phase units while retaining nested task bytes", () => {
    const source = [
      "\uFEFF# Tasks",
      "intro",
      "## Phase",
      "lead",
      "### Task",
      "body",
      "```md",
      "## fenced",
      "```",
      "Phase",
      "-----",
      "again",
      "",
    ].join("\r\n");
    const original = bytes(source);
    const result = scanV3DecomposeContent("tasks-sample.md", original);
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.map(({ locator }) => locator)).toEqual([
      { artifact: "tasks-sample.md", kind: "preamble" },
      {
        artifact: "tasks-sample.md",
        kind: "section",
        level: 2,
        headingSource: "Phase",
        ancestry: [],
        occurrence: 0,
      },
      {
        artifact: "tasks-sample.md",
        kind: "section",
        level: 2,
        headingSource: "Phase",
        ancestry: [],
        occurrence: 1,
      },
    ]);
    expect(result.units[1]?.content).toContain("### Task\r\nbody\r\n");
    expect(result.units[1]?.content).toContain("## fenced\r\n");
    expect(Buffer.concat(result.units.map(({ bytes: unitBytes }) => Buffer.from(unitBytes))))
      .toEqual(Buffer.from(original));
    expect(resolveV3DecomposeContentLocator(
      result.units,
      result.units[2]?.locator,
      "tasks-sample.md",
    )).toEqual({ status: "resolved", unit: result.units[2] });
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

  it("records exact half-open UTF-8 byte ranges for every emitted unit", () => {
    const source = "\uFEFFpré\r\n## A\r\n😀\r\n### B\r\nx\r\n## C\r\n";
    const result = scanV3DecomposeContent("draft-sample.md", bytes(source));
    expect(result.status).toBe("scanned");
    if (result.status !== "scanned") return;

    expect(result.units.map(({ byteRange }) => byteRange)).toEqual([
      { start: 0, end: 9 },
      { start: 9, end: 21 },
      { start: 21, end: 31 },
      { start: 31, end: 37 },
    ]);
    for (const unit of result.units) {
      expect(unit.bytes).toEqual(bytes(source).slice(unit.byteRange.start, unit.byteRange.end));
    }
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
        byteRange: { start: 0, end: markdown.length },
      }],
    });
    expect(scanV3DecomposeContent("payload.bin", binary)).toEqual({
      status: "scanned",
      units: [{
        locator: { artifact: "payload.bin", kind: "whole-file" },
        content: "\uFFFD\u0000\u007F",
        bytes: binary,
        byteRange: { start: 0, end: binary.length },
      }],
    });
    expect(scanV3DecomposeContent("empty.md", new Uint8Array())).toEqual({
      status: "scanned",
      units: [{
        locator: { artifact: "empty.md", kind: "preamble" },
        content: "",
        bytes: new Uint8Array(),
        byteRange: { start: 0, end: 0 },
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
