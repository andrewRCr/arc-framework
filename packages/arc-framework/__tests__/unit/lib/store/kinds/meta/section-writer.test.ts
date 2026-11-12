/** Session Context edits preserve surrounding fields and other sections. */

import { describe, expect, it } from "vitest";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { writeMetaSessionContext } from "../../../../../../src/lib/store/kinds/meta/section-writer.js";

const original = makeMetaFixture("sample")
  .replace("\n---", "\n## Release Notes Entry\n\nRelease prose.\n\n## Completion Notes\n\nCompleted prose.\n\n---")
  + "\n## Outside\n\nOutside prose.\n";
const body = "### Remaining Work\n\nFollow the next task.";
const section = `## Session Context\n\n${body}\n\n`;

const withContext = original.replace("## Release Notes Entry", `${section}## Release Notes Entry`);

describe("meta Session Context writer", () => {
  it("inserts the section after the fields and before other field-block sections", () => {
    const result = writeMetaSessionContext(original, body);
    expect(result).toBe(withContext);
    expect(parseMetaRecord(result).sessionContext).toBe(body);
  });

  it("replaces only the section body", () => {
    expect(writeMetaSessionContext(withContext, "New context")).toBe(withContext.replace(
      body, "New context"));
  });

  it("removes only the section on null", () => {
    expect(writeMetaSessionContext(withContext, null)).toBe(original);
  });

  it.each(["\n", "\r\n"])("clears every repeated section while preserving outside bytes with %j endings", (ending) => {
    const repeated = withContext.replace("## Completion Notes", `${section}## Completion Notes`)
      .replace("## Outside", `${section}## Outside`).replace(/\n/gu, ending);
    const result = writeMetaSessionContext(repeated, null);
    expect(result).toBe(original.replace(/\n/gu, ending));
    expect(parseMetaRecord(result).sessionContext).toBeNull();
  });

  it.each(["\n", "\r\n"].flatMap((ending) => ["", "## Preview\n\nPreview prose.\n\n"].map(
    (boundary) => ({ ending, boundary }),
  )))("clears pre-H1 context and preserves metadata anchors with %j", ({ ending, boundary }) => {
    const prefix = "Preamble prose.\n\n";
    const content = `${prefix}## Session Context\n\nStale context.\n\n${boundary}${withContext}`
      .replace(/\n/gu, ending);
    expect(parseMetaRecord(content).sessionContext).not.toBeNull();
    const result = writeMetaSessionContext(content, null);
    expect(result).toBe(`${prefix}${boundary}${original}`.replace(/\n/gu, ending));
    expect(parseMetaRecord(result).sessionContext).toBeNull();
  });

  it("sets an empty present section body", () => {
    const result = writeMetaSessionContext(original, "");
    expect(result).toBe(original.replace("## Release Notes Entry", "## Session Context\n\n## Release Notes Entry"));
    expect(parseMetaRecord(result).sessionContext).toBe("");
  });

  it("inserts before the closing rule when the field block has no sections", () => {
    const content = makeMetaFixture("sample");
    expect(writeMetaSessionContext(content, body)).toBe(content.replace("---\n", `${section}---\n`));
  });

  it("replaces a section after the field block without rewriting the field block", () => {
    const content = makeMetaFixture("sample") + `\n${section}## Other\n\nOther prose.\n`;
    expect(writeMetaSessionContext(content, "New context")).toBe(content.replace(body, "New context"));
  });


  it("preserves CRLF endings when replacing a section", () => {
    const content = withContext.replace(/\n/gu, "\r\n");
    const result = writeMetaSessionContext(content, "New context\nwith a continuation");
    expect(result).toBe(content.replace(body.replace(/\n/gu, "\r\n"), "New context\r\nwith a continuation"));
    expect(parseMetaRecord(result).sessionContext).toBe("New context\nwith a continuation");
  });

  it.each(["## Other", "---", " \t--- ", "```md\n## Other\n```", "```md\n---\n```"])(
    "refuses a body containing a section boundary: %j", (invalid) => {
      expect(() => writeMetaSessionContext(original, invalid)).toThrow(/section boundary/iu);
    },
  );
});
