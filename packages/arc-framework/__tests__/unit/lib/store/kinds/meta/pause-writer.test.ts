/** Whole pause writes preserve other metadata bytes and optional defaults. */
import { describe, expect, it } from "vitest";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { writeMetaPause } from "../../../../../../src/lib/store/kinds/meta/section-writer.js";
import type { MetaPause } from "../../../../../../src/lib/active/meta-schema.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
const original = makeMetaFixture("sample");
const pause: MetaPause = { pausedBy: "andrew" as MetaPause["pausedBy"], since: "2026-10-13T12:00:00Z", reason: "Waiting.",
  waitsOn: null, resumeNotes: null, open: false };
describe("meta pause writer", () => {
  it("round-trips the whole section and restores original bytes on clear", () => {
    const value = { ...pause, waitsOn: { kind: "note" as const, text: "External approval." },
      resumeNotes: "Pick up next task.", open: true };
    const written = writeMetaPause(original, value);
    expect(parseMetaRecord(written).pause).toEqual(value);
    expect(writeMetaPause(written, null)).toBe(original);
  });
  it("omits default optional fields", () => {
    const written = writeMetaPause(original, pause);
    expect(parseMetaRecord(written).pause).toEqual(pause);
    expect(written).not.toContain("Waits On");
    expect(written).not.toContain("Open to Takers");
    expect(written).not.toContain("Resume Notes");
  });
  it.each(["## Other", "---", " \t--- ", "```md\n## Other\n```"])("refuses section boundary %j", (text) => {
    expect(() => writeMetaPause(original, { ...pause, resumeNotes: text })).toThrow(/section boundary/iu);
  });
});

it.each(["`other`", "\\`other\\`", "waiting for `other`", "`two\nlines`"])("preserves note identity for %j", (text) => {
  const value = { ...pause, waitsOn: { kind: "note" as const, text } };
  expect(parseMetaRecord(writeMetaPause(original, value)).pause).toEqual(value);
});

it("refuses the reserved resume-notes heading before rendering", () => {
  expect(() => writeMetaPause(original, { ...pause, resumeNotes: "### Resume Notes\n\nContinue here." }))
    .toThrow(/reserved/iu);
});
