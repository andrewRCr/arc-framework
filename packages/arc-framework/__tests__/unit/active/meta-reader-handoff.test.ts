/** Handoff fields and section bodies recovered from work-unit metadata. */

import { describe, expect, it } from "vitest";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { parseMetaRecord, renderMetaFile, toMetaRecord, setMetaBulletFields, reconcileMetaFields } from "../../../src/lib/active/meta-reader.js";
import { StateVersionSchema } from "../../../src/lib/store/identity.js";

function withFields(lines: string): string {
  return makeMetaFixture("sample").replace("\n---", `\n${lines}\n\n---`);
}

describe("meta handoff fields", () => {
  describe.each([
    ["generic setter", (content: string, value: string) => setMetaBulletFields(content, { "Session Type": value })],
    ["reconciliation", (content: string, value: string) => reconcileMetaFields(content, { "Session Type": value }).content],
  ] as const)("%s canonical Session Type", (_name, write) => {
    it.each(["Planning", "Execution", "`Planning`", "`Execution`"])("admits %s", (value) => {
      const result = write(makeMetaFixture("sample"), value);
      const token = value.replaceAll("`", "");
      expect(parseMetaRecord(result).sessionType).toBe(token.toLowerCase());
      expect(result).toContain(`- **Session Type:** \`${token}\``);
    });
  });

  it("recovers handoff anchors and the session type from their bullets", () => {
    const parsed = parseMetaRecord(withFields([
      "- **State at Handoff:** `state-version`",
      "- **Commit at Handoff:** `abc123`",
      "- **Session Type:** `planning`",
    ].join("\n")));
    expect(parsed.stateAtHandoff).toBe("state-version");
    expect(parsed.commitAtHandoff).toBe("abc123");
    expect(parsed.sessionType).toBe("planning");
    expect(toMetaRecord(parsed)).toEqual(parsed);
  });

  it("renders the handoff group after Next Action with the anchors backticked", () => {
    const markdown = renderMetaFile("sample", {
      state: "Active", owner: "test-owner", stateAtHandoff: StateVersionSchema.parse("state-version"),
      commitAtHandoff: "abc123", sessionType: "planning",
    });
    expect(markdown).toContain("- **State at Handoff:** `state-version`\n- **Commit at Handoff:** `abc123`\n- **Session Type:** `Planning`");
    expect(markdown.indexOf("**Next Action:**")).toBeLessThan(markdown.indexOf("**State at Handoff:**"));
    expect(markdown.indexOf("**Session Type:**")).toBeLessThan(markdown.indexOf("**PR URL:**"));
  });
  it.each(["PLANNING", "Planning", "EXECUTION", "Execution"])("normalizes recognized session type %s", (value) => {
    const parsed = parseMetaRecord(withFields(`- **Session Type:** ${value}`));
    expect(parsed.sessionType).toBe(value.toLowerCase());
    expect(toMetaRecord(parsed)).toEqual(parsed);
  });

  it("keeps an unrecognized session type as authored for a durable refusal", () => {
    const parsed = parseMetaRecord(withFields("- **Session Type:** Investigating"));
    expect(parsed.sessionType).toBe("Investigating");
    expect(toMetaRecord(parsed)).toBeNull();
  });

});

describe("meta section bodies", () => {
  it("keeps session context subsections and stops at the field block's closing rule", () => {
    const content = withFields("## Session Context\n\n### Blockers\n\nWaiting for a dependency.")
      + "\nText outside the field block.\n";
    const parsed = parseMetaRecord(content);
    expect(parsed.sessionContext).toBe("### Blockers\n\nWaiting for a dependency.");
    expect(toMetaRecord(parsed)).toEqual(parsed);
  });

  it("keeps repeated completion and release sections in file order across the field block", () => {
    const content = withFields("## Completion Notes\n\nFirst\n\n## Release Notes Entry\n\nRelease one")
      + "\n## Completion Notes\n\nSecond\n\n## Release Notes Entry\n\nRelease two\n";
    const parsed = parseMetaRecord(content);
    expect(parsed.completionNotes).toEqual(["First", "Second"]);
    expect(parsed.releaseNotesEntry).toEqual(["Release one", "Release two"]);
  });

  it("retains empty section bodies as present values", () => {
    const parsed = parseMetaRecord(withFields("## Session Context\n\n## Completion Notes\n\n## Release Notes Entry\n"));
    expect(parsed.sessionContext).toBe("");
    expect(parsed.completionNotes).toEqual([""]);
    expect(parsed.releaseNotesEntry).toEqual([""]);
    expect(toMetaRecord(parsed)).toEqual(parsed);
  });

  it("keeps a rule outside the field block as section prose", () => {
    const parsed = parseMetaRecord(makeMetaFixture("sample") + "\n## Completion Notes\n\nFirst\n---\nSecond");
    expect(parsed.completionNotes).toEqual(["First\n---\nSecond"]);
  });

  it("reads section boundaries even inside a fence", () => {
    const parsed = parseMetaRecord(withFields("## Session Context\n\n```md\n## Completion Notes\n\nDone\n```"));
    expect(parsed.sessionContext).toBe("```md");
    expect(parsed.completionNotes).toEqual(["Done\n```"]);
  });
});
