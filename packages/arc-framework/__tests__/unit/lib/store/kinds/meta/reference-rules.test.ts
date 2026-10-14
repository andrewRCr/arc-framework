/** Metadata references resolve only newly introduced edges against the resulting batch. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../../../../../src/lib/kernel/index.js";
import { writeCohortDocument, parseCohortDocument } from "../../../../../../src/lib/store/kinds/cohort/index.js";
import { checkMetaDependsOn, checkMetaDesignEntry, checkMetaCohort } from "../../../../../../src/lib/store/kinds/meta/reference-rules.js";
import { META_RULE_CONTENT as content, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
import { recordReferences, StoreRecordSchema, type LookupResult, type StoreResult } from "../../../../../../src/lib/store/index.js";

const uid = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
function depends(...names: string[]): string { return content.replace("- **Depends On:** [none]",
  `- **Depends On:** ${names.map((name) => `\`${name}\``).join(", ")}`); }

describe("metadata dependencies", () => {
  it("refuses a new unresolved edge", async () => {
    expect(await checkMetaDependsOn(metaRuleInput(depends("missing")))).toMatchObject([{ rule: "meta.depends-on" }]);
  });
  it("refuses ambiguous generations", async () => {
    const input = metaRuleInput(depends("target"));
    input.after = ruleView([ruleRecord("work-item/meta", "target", uid), ruleRecord("work-item/record", "target", other)]);
    expect(await checkMetaDependsOn(input)).toMatchObject([{ rule: "meta.depends-on" }]);
  });
  it("refuses an invalid dependency slug", async () => {
    expect(await checkMetaDependsOn(metaRuleInput(depends("Not a slug")))).toMatchObject([{ rule: "meta.depends-on" }]);
  });
  it("refuses an unavailable dependency observation", async () => {
    const input = metaRuleInput(depends("target"));
    const failure: StoreResult<LookupResult> = { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: "work-item", condition: "Inventory unavailable", remedy: { text: "Retry the inventory." } } };
    input.after = ruleView([], new Map([["slug:target", failure]]));
    expect(await checkMetaDependsOn(input)).toMatchObject([{ rule: "meta.depends-on" }]);
  });
  it("admits a uniquely resolved live target", async () => {
    const input = metaRuleInput(depends("target"));
    input.after = ruleView([ruleRecord("work-item/meta", "target", uid)]);
    expect(await checkMetaDependsOn(input)).toEqual([]);
  });
  it("admits a live target ahead of an older completed generation", async () => {
    const input = metaRuleInput(depends("target"));
    const old = ruleRecord("work-item/meta", "target", other);
    input.after = ruleView([StoreRecordSchema.parse({ ...old,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4"), sequence: ArchiveSequenceSchema.parse("01") } }),
      ruleRecord("work-item/meta", "target", uid)]);
    expect(await checkMetaDependsOn(input)).toEqual([]);
  });
  it("admits a stale ambiguous edge left unchanged by an unrelated edit", async () => {
    const prior = depends("target"), input = metaRuleInput(`${prior}\n## Notes\n\nEdit.\n`, prior);
    input.after = ruleView([ruleRecord("work-item/meta", "target", uid), ruleRecord("work-item/record", "target", other)]);
    expect(await checkMetaDependsOn(input)).toEqual([]);
  });
  it("admits deletion of a stale edge", async () => {
    expect(await checkMetaDependsOn(metaRuleInput(content, depends("missing")))).toEqual([]);
  });
  it("admits dependencies without prior field evidence", async () => {
    expect(await checkMetaDependsOn(metaRuleInput(depends("missing"), "# Broken\n"))).toEqual([]);
  });
});

function design(...entries: string[]): string { return content.replace("- **Design:** `spec-example.md`",
  `- **Design:** ${entries.map((entry) => `\`${entry}\``).join(", ")}`); }
function companion(key: "spec-prd" | "spec-rfc") {
  const record = ruleRecord("work-item/spec", "example", "00000000-0000-4000-8000-000000000001");
  return StoreRecordSchema.parse({ ...record, reference: recordReferences["work-item/companion"](record.reference.owner, key) });
}
describe("metadata design references", () => {
  it.each(["spec-other.md", "https://example.test/design.md", "notes-example.md"])("refuses a foreign entry %s", async (entry) => {
    expect(await checkMetaDesignEntry(metaRuleInput(design(entry)))).toMatchObject([{ rule: "meta.design-entry" }]);
  });
  it("refuses more than two entries even when each is owned", async () => {
    const input = metaRuleInput(design("draft-example.md", "spec-example.md", "spec-example-prd.md"));
    input.after = ruleView([companion("spec-prd")]);
    expect(await checkMetaDesignEntry(input)).toMatchObject([{ rule: "meta.design-entry" }]);
  });
  it("refuses a paired filename without its own companion", async () => {
    const input = metaRuleInput(design("spec-example-prd.md"));
    const wrong = companion("spec-rfc");
    input.after = ruleView([wrong]);
    expect(await checkMetaDesignEntry(input)).toMatchObject([{ rule: "meta.design-entry" }]);
  });
  it("admits its own draft and spec filenames without stored artifacts", async () => {
    expect(await checkMetaDesignEntry(metaRuleInput(design("draft-example.md", "spec-example.md")))).toEqual([]);
  });
  it.each(["spec-prd", "spec-rfc"] as const)("admits the stored own %s companion", async (key) => {
    const input = metaRuleInput(design(`spec-example-${key.slice(5)}.md`));
    input.after = ruleView([companion(key)]);
    expect(await checkMetaDesignEntry(input)).toEqual([]);
  });
  it.each([["spec-other.md"], ["spec-other.md", "draft-other.md", "notes-other.md"]].map((entries) => [entries]))("admits unchanged legacy entries", async (entries) => {
    const prior = design(...entries);
    expect(await checkMetaDesignEntry(metaRuleInput(`${prior}\n## Notes\n\nEdit.\n`, prior))).toEqual([]);
  });
  it("admits a repair without prior parsed field authority", async () => {
    expect(await checkMetaDesignEntry(metaRuleInput(design("spec-other.md"), "# Broken\n"))).toEqual([]);
  });
});

const template = "# Cohort: `{cohort-name}`\n\n**Parent:** {parent}\n\n**Purpose:** {purpose}\n";
function cohort(path: string): string { return content.replace("- **Cohort:** [none]", `- **Cohort:** \`${path}\``); }
function cohortDocument(path: string, generation = uid) {
  const bytes = writeCohortDocument(template, path, "Authored purpose")!;
  const fields = parseCohortDocument(bytes);
  if (!fields.success) throw new Error(fields.error);
  return ruleRecord("cohort/document", path.split("/").at(-1)!, generation, bytes, fields.data);
}
describe("metadata cohort references", () => {
  it("refuses a new missing cohort", async () => {
    expect(await checkMetaCohort(metaRuleInput(cohort("missing")))).toMatchObject([{ rule: "meta.cohort" }]);
  });
  it.each(["child", "wrong/child", "parent/child/deeper", "Not a slug"])("refuses a noncanonical full path %s", async (path) => {
    const input = metaRuleInput(cohort(path));
    input.after = ruleView([cohortDocument("parent/child")]);
    expect(await checkMetaCohort(input)).toMatchObject([{ rule: "meta.cohort" }]);
  });
  it("refuses a closed cohort", async () => {
    const input = metaRuleInput(cohort("parent"));
    input.after = ruleView([StoreRecordSchema.parse({ ...cohortDocument("parent"),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4"), sequence: "01", closeout: "a" } })]);
    expect(await checkMetaCohort(input)).toMatchObject([{ rule: "meta.cohort" }]);
  });
  it("refuses an unreadable named document", async () => {
    const input = metaRuleInput(cohort("parent")), good = cohortDocument("parent");
    input.after = ruleView([{ ...good, content: good.content.replace("**Purpose:**", "**Parent:** bare\n\n**Purpose:**") }]);
    expect(await checkMetaCohort(input)).toMatchObject([{ rule: "meta.cohort" }]);
  });
  it("refuses ambiguous named generations", async () => {
    const input = metaRuleInput(cohort("parent")), good = cohortDocument("parent");
    input.after = ruleView([good, cohortDocument("parent", other)]);
    expect(await checkMetaCohort(input)).toMatchObject([{ rule: "meta.cohort" }]);
  });
  it.each(["parent", "parent/child"])("admits the open full path %s without completed placement", async (path) => {
    const input = metaRuleInput(cohort(path));
    input.after = ruleView([cohortDocument(path)]);
    expect(await checkMetaCohort(input)).toEqual([]);
  });
  it("admits a good named cohort despite an unrelated malformed document", async () => {
    const input = metaRuleInput(cohort("parent"));
    const bad = cohortDocument("other", other);
    input.after = ruleView([cohortDocument("parent"), { ...bad, content: "**Parent:** bare\n" }]);
    expect(await checkMetaCohort(input)).toEqual([]);
  });
  it("admits removing membership", async () => {
    expect(await checkMetaCohort(metaRuleInput(content, cohort("closed")))).toEqual([]);
  });
  it("admits unchanged stale membership", async () => {
    const prior = cohort("closed");
    expect(await checkMetaCohort(metaRuleInput(`${prior}\n## Notes\n\nEdit.\n`, prior))).toEqual([]);
  });
  it("admits integrity fields without readable prior values", async () => {
    expect(await checkMetaCohort(metaRuleInput(cohort("missing"), "# Broken\n"))).toEqual([]);
  });
});

it("refuses a new unresolved pause waits-on slug", async () => {
  const next = content.replace("---\n", "## Pause\n\n- **Paused By:** `andrew`\n- **Since:** `2026-10-13T12:00:00Z`\n- **Reason:** Waiting.\n- **Waits On:** `missing`\n\n---\n");
  expect(await checkMetaDependsOn(metaRuleInput(next))).toMatchObject([{ rule: "meta.depends-on" }]);
});
