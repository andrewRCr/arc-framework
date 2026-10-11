/** Legacy metadata editing contracts over the typed field writers. */

import { describe, expect, it } from "vitest";
import {
  normalizeMetaCoreTable, setMetaBranch, setMetaClass, setMetaState, setMetaTitle,
  setMetaBulletFields, setMetaCurrentWorkflow, setMetaDesign, parseMetaRecord,
  reconcileMetaFields, setMetaCandidate, setMetaFinalizeFields,
  emptyParsedMetaRecord,
} from "../../../src/lib/active/meta-reader.js";
import { MetaCandidateIdSchema, ParsedMetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

const setters = [
  ["State", (content: string) => setMetaState(content, "Planning")],
  ["Branch", (content: string) => setMetaBranch(content, "plan/example")],
  ["Class", (content: string) => setMetaClass(content, "Heavy")],
  ["Title", (content: string) => setMetaTitle(content, "renamed")],
  ["Normalization", normalizeMetaCoreTable],
] as const;

describe("empty parsed metadata", () => {
  it("carries every field with no scalar or list evidence", () => {
    const record = emptyParsedMetaRecord();
    const listFields = new Set(["dependsOn", "design", "completionNotes", "releaseNotesEntry"]);
    const expected = Object.fromEntries(Object.keys(ParsedMetaRecordSchema.shape)
      .map((key) => [key, listFields.has(key) ? [] : null]));
    expect(record).toEqual(expected);
    expect(ParsedMetaRecordSchema.parse(record)).toEqual(record);
  });
});

describe("metadata setter anchors", () => {
  it.each(setters)("%s refuses metadata without its closing rule", (_name, set) => {
    const content = makeMetaFixture("example").replace(/\n---\n$/u, "\n");
    expect(() => set(content)).toThrow(/closing.*---/iu);
  });

  it.each(setters.filter(([name]) => name !== "Title"))(
    "%s refuses metadata without its heading", (_name, set) => {
      const content = makeMetaFixture("example").replace(/^# Metadata: example\n/u, "");
      expect(() => set(content)).toThrow(/H1/iu);
    },
  );
});

describe("targeted metadata backfills", () => {
  it("keeps authored fields and every section while inserting only missing lines", () => {
    const section = "## Session Context\n\nA handoff.\n\n## Completion Notes\n\nA result.\n\n";
    const original = makeMetaFixture("example", { nextAction: "Keep `this` prose." })
      .replace("- **Cohort:** [none]\n", "")
      .replace("- **Design:** [none]", "* **Design:**   `spec-example.md`")
      .replace("\n---\n", `\n${section}---\n`);
    const result = reconcileMetaFields(original, { Design: "spec-other.md" });
    expect(result.backfilled).toEqual(["Cohort"]);
    expect(result.content).toContain(section);
    expect(result.content.replace("- **Cohort:** [none]\n", "")).toBe(original);
  });

  it("writes Candidate alone when another field is absent", () => {
    const original = makeMetaFixture("example").replace("- **Cohort:** [none]\n", "");
    const value = `sha256:${"c".repeat(64)}`;
    const written = setMetaCandidate(original, value);
    expect(written).not.toContain("**Cohort:**");
    expect(written.replace(`- **Candidate:** \`${value}\`\n`, "")).toBe(original);
  });

  it.each([false, true])("writes only finalize facts before an internal section (partial: %s)", (partial) => {
    const section = "## Completion Notes\n\nKeep the result.\n\n";
    let original = makeMetaFixture("example")
      .replace("- **Cohort:** [none]\n", "")
      .replace("- **Completed:** [none]\n", "")
      .replace("\n---\n", `\n${section}---\n`);
    if (!partial) original = original.replace("- **PR URL:** [none]\n", "");
    const written = setMetaFinalizeFields(original, { prUrl: "https://example.com/pr/1", completed: "2026-10-11" });
    expect(written).not.toContain("**Cohort:**");
    expect(written).toContain(section);
    expect(written.indexOf("**PR URL:**")).toBeLessThan(written.indexOf("**Completed:**"));
    expect(written.indexOf("**Completed:**")).toBeLessThan(written.indexOf("## Completion Notes"));
    const withoutFacts = partial
      ? written.replace(/^- \*\*(?:PR URL|Completed):\*\*.*\n/gmu, "")
      : written.replace(/\n- \*\*PR URL:\*\*.*\n- \*\*Completed:\*\*.*\n/u, "");
    expect(withoutFacts)
      .toBe(original.replace(/^- \*\*PR URL:\*\*.*\n/gmu, ""));
  });

  it("does not report an omitted optional field as backfilled", () => {
    const content = makeMetaFixture("example");
    expect(reconcileMetaFields(content, { Candidate: "[none]" })).toEqual({ content, backfilled: [] });
  });

  it.each([
    ["H1", (content: string) => content.replace(/^# Metadata: example\n/u, "")],
    ["closing.*---", (content: string) => content.replace(/\n---\n$/u, "\n")],
  ] as const)("reconciliation refuses a missing %s anchor", (message, remove) => {
    expect(() => reconcileMetaFields(remove(makeMetaFixture("example")))).toThrow(new RegExp(message, "iu"));
  });
});

describe("legacy bullet setter rendering", () => {
  const first = `foundation-${"a".repeat(60)}`;
  const second = `application-${"b".repeat(60)}`;

  it.each([
    ["Depends On", (content: string) => setMetaBulletFields(content, {
      "Depends On": `\`${first}\`, \`${second}\``,
    })],
    ["Design", (content: string) => setMetaBulletFields(content, {
      Design: `\`${first}.md\`, \`${second}.md\``,
    })],
    ["Design", (content: string) => setMetaDesign(content, `${first}.md, ${second}.md`)],
  ] as const)("wraps %s lists within the bullet width", (field, set) => {
    const written = set(makeMetaFixture("example"));
    const lines = written.split("\n");
    const index = lines.findIndex((line) => line.startsWith(`- **${field}:**`));
    expect(lines[index + 1]).toMatch(/^ {2}`/u);
    expect(lines[index]?.length).toBeLessThanOrEqual(120);
    expect(lines[index + 1]?.length).toBeLessThanOrEqual(120);
    expect(parseMetaRecord(written)[field === "Design" ? "design" : "dependsOn"])
      .toEqual(field === "Design" ? [`${first}.md`, `${second}.md`] : [first, second]);
  });

  it("renders a cleared directive as an em dash", () => {
    const written = setMetaBulletFields(makeMetaFixture("example"), { "Next Action": "[none]" });
    expect(written).toContain("- **Next Action:** —\n");
    expect(parseMetaRecord(written).nextAction).toBeNull();
  });

  it.each([
    ["generic", (content: string) => setMetaBulletFields(content, { "Next Action": "Continue." })],
    ["workflow", (content: string) => setMetaCurrentWorkflow(content, "create-spec")],
    ["design", (content: string) => setMetaDesign(content, "spec-example.md")],
  ] as const)("%s refuses an unanchored field block", (_name, set) => {
    expect(() => set(makeMetaFixture("example").replace(/\n---\n$/u, "\n"))).toThrow(/closing.*---/iu);
  });
});

describe("legacy CRLF bullet edits", () => {
  const candidateId = MetaCandidateIdSchema.parse(`sha256:${"d".repeat(64)}`);
  const original = makeMetaFixture("example", { candidateId })
    .replace("\n---\n", "\n## Session Context\n\nKeep `authored` context.\n\n---\n")
    .replace(/\n/gu, "\r\n");
  const nextCandidate = `sha256:${"e".repeat(64)}`;

  it.each([
    ["workflow", (content: string) => setMetaCurrentWorkflow(content, "create-spec"),
      [["- **Current Workflow:** [none]", "- **Current Workflow:** `create-spec`"]]],
    ["design", (content: string) => setMetaDesign(content, "spec-example.md"),
      [["- **Design:** [none]", "- **Design:** `spec-example.md`"]]],
    ["Candidate", (content: string) => setMetaCandidate(content, nextCandidate),
      [[`- **Candidate:** \`${candidateId}\``, `- **Candidate:** \`${nextCandidate}\``]]],
    ["finalize", (content: string) => setMetaFinalizeFields(content, {
      prUrl: "https://example.com/pr/1", completed: "2026-10-11",
    }), [["- **PR URL:** [none]", "- **PR URL:** <https://example.com/pr/1>"],
      ["- **Completed:** [none]", "- **Completed:** 2026-10-11"]]],
    ["generic", (content: string) => setMetaBulletFields(content, { "Next Action": "Continue." }),
      [["- **Next Action:** —", "- **Next Action:** Continue."]]],
  ] as const)("%s updates only its fields without changing line endings", (_name, set, replacements) => {
    let expected = original;
    for (const [before, after] of replacements) expected = expected.replace(`${before}\r\n`, `${after}\r\n`);
    expect(expected).not.toBe(original);
    const result = set(original);
    expect(result).toBe(expected);
    expect(result.replace(/\r\n/gu, "")).not.toContain("\n");
  });
});

describe("legacy canonical clear forms", () => {
  const candidateId = MetaCandidateIdSchema.parse(`sha256:${"f".repeat(64)}`);
  const context = "\n## Session Context\n\nKeep `authored` context.\n\n---\n";
  const original = makeMetaFixture("example", { candidateId, branch: "feat/example" })
    .replace("\n---\n", context);
  const expectedBranch = makeMetaFixture("example", { candidateId, branch: null })
    .replace("\n---\n", context);

  it.each([
    ["Candidate", (content: string) => setMetaCandidate(content, "[none]"),
      original.replace(`- **Candidate:** \`${candidateId}\`\n`, ""), "candidateId"],
    ["generic Candidate", (content: string) => setMetaBulletFields(content, { Candidate: "[none]" }),
      original.replace(`- **Candidate:** \`${candidateId}\`\n`, ""), "candidateId"],
    ["Branch", (content: string) => setMetaBranch(content, "—"), expectedBranch, "branch"],
  ] as const)("%s clears its value while preserving LF and CRLF content", (_name, clear, expected, key) => {
    expect(expected).not.toBe(original);
    for (const ending of ["\n", "\r\n"]) {
      const result = clear(original.replaceAll("\n", ending));
      expect(result).toBe(expected.replaceAll("\n", ending));
      expect(parseMetaRecord(result)[key]).toBeNull();
      if (ending === "\r\n") expect(result.replaceAll(ending, "")).not.toContain("\n");
    }
  });
});
