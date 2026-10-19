/** Record link rules resolve through semantic identity without filesystem reads. */
import { describe, expect, it } from "vitest";
import { KIND_SHAPES, type KindId } from "../../../../src/lib/store/catalog.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { checkRecordLinks, readRecordLinkViolations } from "../../../../src/lib/store/kinds/record-links.js";
import type { WriteCheckInput } from "../../../../src/lib/store/write-check.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";

function reference(kind: KindId, key?: string) {
  return RecordReferenceSchema.parse({
    kind, owner: OwnerIdentitySchema.parse({ type: KIND_SHAPES[kind].owner, name: "example" }),
    ...(key === undefined ? {} : { key }),
  });
}

function write(content?: string, prior?: string): WriteCheckInput {
  const view = new ReferenceBackend();
  return {
    reference: reference("work-item/notes"), writer: { kind: "hand-edit" }, before: view, after: view,
    ...(content === undefined ? {} : { next: { content, fields: {} } }),
    ...(prior === undefined ? {} : { prior: { content: prior, fields: null } }),
  };
}

describe("record link targets", () => {
  it.each(["work-item/draft", "cohort/document"] as const)("refuses relative links in movable %s", kind => {
    expect(readRecordLinkViolations(reference(kind), "[x](README.md)\n")).toEqual([
      { rule: "links.relative-in-movable", key: "README.md", value: "README.md", line: 1, column: 1 },
    ]);
  });
  it.each([
    ["work-item/notes", undefined, "/.arc/active/../backlog/topic/"],
    ["personal/inbox", undefined, "../other/WORKING-MEMORY.md?view=1#memories"],
    ["personal/working-memory", undefined, "/.arc/%61ctive/current/meta-example.md"],
    ["personal/session-context", "work", "../../other/USER-INBOX.md"],
    ["personal/document", "drafts/topic.md", "../../other/USER-INBOX.md"],
    ["project-inbox/inbox", undefined, "planned/topic/draft-topic.md"],
  ] as const)("recognizes projected targets from %s", (kind, key, url) => {
    expect(readRecordLinkViolations(reference(kind, key), `[x](${url})`)).toEqual([
      expect.objectContaining({ rule: "links.into-projection", line: 1, column: 1 }),
    ]);
  });
  it("keys projected violations by normalized decoded targets", () => {
    expect(readRecordLinkViolations(reference("work-item/spec"), "![x](/.arc/%61ctive/./topic/../current/?a#b)"))
      .toEqual([expect.objectContaining({ key: ".arc/active/current", value: "/.arc/%61ctive/./topic/../current/?a#b" })]);
  });
  it.each([
    ["work-item/spec", undefined, "/README.md"],
    ["work-item/spec", undefined, "%2FREADME.md"],
    ["personal/inbox", undefined, "../../../README.md"],
    ["personal/working-memory", undefined, "../../../docs/guide.md"],
    ["personal/session-context", "work", "../../../../README.md"],
    ["personal/document", "drafts/topic.md", "../../../../README.md"],
    ["project-inbox/inbox", undefined, "../../README.md"],
    ["work-item/notes", undefined, "/.arc/user/README.md"],
    ["work-item/draft", undefined, "https://example.com/.arc/active/meta-example.md"],
    ["cohort/document", undefined, "#heading"],
    ["work-item/spec", undefined, "?query"],
    ["work-item/spec", undefined, "mailto:person@example.com"],
  ] as const)("admits legal target from %s: %s %s", (kind, key, url) => {
    expect(readRecordLinkViolations(reference(kind, key), `[x](${url})`)).toEqual([]);
  });
  it.each(["diagram.md", "spec-prd.md", "spec-rfc.md"])("reads Markdown companion path %s", key => {
    expect(readRecordLinkViolations(reference("work-item/companion", key), "[x](relative.md)"))
      .toEqual([expect.objectContaining({ rule: "links.relative-in-movable" })]);
  });
  it("ignores non-Markdown personal documents", () => {
    expect(readRecordLinkViolations(reference("personal/document", "assets/notes.txt"), "[x](/.arc/active) [x][missing]"))
      .toEqual([]);
  });
  it("uses the declared extension of a path-keyed companion", () => {
    const companion = reference("work-item/companion", "appendix");
    expect(readRecordLinkViolations({ ...companion, key: "assets/diagram.svg" }, "[x](relative.md) [x][missing]"))
      .toEqual([]);
    expect(readRecordLinkViolations({ ...companion, key: "appendix/details.md" }, "[x](relative.md)"))
      .toEqual([expect.objectContaining({ rule: "links.relative-in-movable" })]);
  });
  it("reads undefined full references in fixed and movable records", () => {
    for (const kind of ["work-item/description", "personal/inbox"] as const) {
      expect(readRecordLinkViolations(reference(kind), "[x][missing]"))
        .toEqual([{ rule: "links.undefined-reference", key: "MISSING", value: "MISSING", line: 1, column: 1 }]);
    }
  });
});

describe("introduced record link rules", () => {
  it("reports all newly broken rules and actionable remedies for a creation", async () => {
    const rules = await checkRecordLinks(write("[a](one.md) [b](two.md)\n\n[x](/.arc/active)\n\n[x][missing]"));
    expect(rules.map(rule => rule.rule)).toEqual([
      "links.relative-in-movable", "links.into-projection", "links.undefined-reference",
    ]);
    expect(rules[0]).toMatchObject({
      condition: expect.stringContaining('"one.md" at line 1, column 1'),
      remedy: { text: "Name the target by its backticked filename, or link a tracked file from the repository root (`/path`), then save again." },
    });
    expect(rules[0]?.condition).toContain('"two.md" at line 1, column 13');
    expect(rules[1]?.remedy.text).toBe("Name the record by its backticked filename instead of linking it, then save again.");
    expect(rules[2]?.remedy.text).toBe("Define each reference in this file, or remove it, then save again.");
  });
  it.each([
    ["[x](old.md)", "New prose\n\n[x](old.md)"],
    ["[x](/.arc/active/topic/)", "[x](/.arc/%61ctive/./topic)"],
    ["[x][MiSSing\t Label]", "[x][missing label]"],
    ["[x](old.md) [x](old.md)", "[x](old.md)"],
  ])("admits unchanged or reduced historical counts despite moved occurrences", async (prior, content) => {
    expect(await checkRecordLinks(write(content, prior))).toEqual([]);
  });
  it("refuses increased counts with every location of the breaking key", async () => {
    const rules = await checkRecordLinks(write("[x](old.md)\n[x](old.md)", "[x](old.md)"));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toContain('"old.md" at line 1, column 1');
    expect(rules[0]?.condition).toContain('"old.md" at line 2, column 1');
  });
  it("refuses a replacement key even when total violations stay constant", async () => {
    const rules = await checkRecordLinks(write("[x](new.md)", "[x](old.md)"));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toContain("new.md");
    expect(rules[0]?.condition).not.toContain("old.md");
  });
  it("distinguishes complete escaped reference labels from historical violations", async () => {
    const rules = await checkRecordLinks(write(String.raw`[x][a\]new]`, String.raw`[x][a\]old]`));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ rule: "links.undefined-reference" });
    expect(rules[0]?.condition).toContain(JSON.stringify(String.raw`A\]NEW`));
    expect(rules[0]?.condition).not.toContain("OLD");
    expect(await checkRecordLinks(write("New prose\n" + String.raw`[x][a\]old]`, String.raw`[x][a\]old]`)))
      .toEqual([]);
  });
  it("counts repeated bracketed references and reports all locations of the breaking label", async () => {
    const reference = "[a[b]c][missing]";
    const rules = await checkRecordLinks(write(`${reference}\n${reference}`, reference));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toContain('"MISSING" at line 1, column 1');
    expect(rules[0]?.condition).toContain('"MISSING" at line 2, column 1');
  });
  it("finds the newly undefined usage when its definition is removed", async () => {
    const rules = await checkRecordLinks(write("[x][known]", "[x][known]\n\n[known]: /README.md"));
    expect(rules).toEqual([expect.objectContaining({ rule: "links.undefined-reference" })]);
  });
  it("admits removals and corrected retries", async () => {
    expect(await checkRecordLinks(write(undefined, "[x](old.md)"))).toEqual([]);
    expect(await checkRecordLinks(write("`old.md`", "[x](old.md)"))).toEqual([]);
  });
  it("reports only breaking keys while retaining malformed prior content", async () => {
    const rules = await checkRecordLinks(write("[x](old.md) [x](new.md)", "[x](old.md)"));
    expect(rules).toHaveLength(1);
    expect(rules[0]?.condition).toContain("new.md");
    expect(rules[0]?.condition).not.toContain("old.md");
  });
  it("applies the same shape rules to verb writes", async () => {
    const input = { ...write("[x](new.md)"), writer: { kind: "verb", verb: "pause" } } as const;
    expect(await checkRecordLinks(input)).toEqual([expect.objectContaining({ rule: "links.relative-in-movable" })]);
  });
});
