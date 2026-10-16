/** Pause is a section independent of the managed metadata fields. */
import { describe, expect, it } from "vitest";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { inspectMetaPauseStructure } from "../../../src/lib/store/kinds/meta/line-reading.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
const original = makeMetaFixture("sample");
const body = "- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting for review.\n- **Waits On:** `other-work`\n- **Open to Takers:** `true`\n\n### Resume Notes\n\nContinue after approval.";
describe("meta pause reader", () => {
  it("reads every field without exposing the section to field readers", () => {
    const record = parseMetaRecord(original.replace("---\n", `## Pause\n\n${body}\n\n---\n`));
    expect(record).toMatchObject({ pause: { pausedBy: "andrew", since: "2026-10-13T12:00:00Z", reason: "Waiting for review.",
      waitsOn: { kind: "work-unit", slug: "other-work" }, resumeNotes: "Continue after approval.", open: true } });
    expect(record.owner).toBe(parseMetaRecord(original).owner);
    expect(record.dependsOn).toEqual([]);
  });
  it("defaults omitted optional pause fields", () => {
    const bytes = original.replace("---\n", "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n\n---\n");
    expect(parseMetaRecord(bytes)).toMatchObject({ pause: { waitsOn: null, resumeNotes: null, open: false } });
  });
  it("reads a prose waits-on note", () => {
    const bytes = original.replace("---\n", `## Pause\n\n${body.replace("`other-work`", "External approval.")}\n\n---\n`);
    expect(parseMetaRecord(bytes)).toMatchObject({ pause: { waitsOn: { kind: "note", text: "External approval." } } });
  });
  it("defaults absent pause to null", () => { expect(parseMetaRecord(original)).toHaveProperty("pause", null); });
});
it("preserves malformed scalar pause values as independent parsed evidence", () => {
  const bytes = original.replace("---\n", `## Pause\n\n${body.replace("`andrew`", "`Not an identity`").replace("2026-10-13T12:00:00Z", "not-a-timestamp")}\n\n---\n`);
  expect(parseMetaRecord(bytes)).toMatchObject({ owner: "test-owner", pause: { pausedBy: "Not an identity", since: "not-a-timestamp" } });
});
it.each([
  body.replace("- **Reason:**", "- **Unknown:**"),
  body.replace("- **Reason:** Waiting for review.", "- **Reason:** Waiting for review.\n- **Reason:** Repeated."),
  `${body}\n### Resume Notes\n\nRepeated.`,
  body.replace("`true`", "invalid"),
  `Unexpected prose.\n\n${body}`,
])("refuses structurally malformed pause section %s", (malformed) => {
  const bytes = original.replace("---\n", `## Pause\n\n${malformed}\n\n---\n`);
  expect(parseMetaRecord(bytes)).toMatchObject({ owner: "test-owner", pause: expect.any(Object) });
  expect(inspectMetaPauseStructure(bytes).length).toBeGreaterThan(0);
});
it("refuses duplicated Pause sections", () => {
  const bytes = original.replace("---\n", `## Pause\n\n${body}\n\n## Pause\n\n${body}\n\n---\n`);
  expect(parseMetaRecord(bytes).pause).not.toBeNull();
  expect(inspectMetaPauseStructure(bytes)).toContain("Pause has duplicate sections");
});
