/** Removal guards preserve authenticated names and fail closed on incomplete after-state evidence. */
import { expect, it } from "vitest";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { checkMetaRemovalEdges } from "../../../../../../src/lib/store/kinds/meta/removal-edges-rule.js";
import { writeMetaDependsOn, writeMetaPause } from "../../../../../../src/lib/store/kinds/meta/writers.js";
import { META_RULE_CONTENT, META_RULE_UID, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { SlugSchema } from "../../../../../../src/lib/kernel/index.js";

it.each(["dependency", "pause"] as const)("protects an authenticated former-name %s edge", async edge => {
  const input = metaRuleInput(null, META_RULE_CONTENT, { kind: "verb", verb: "decompose" });
  const removed = { ...ruleRecord("work-item/meta", "example", META_RULE_UID, META_RULE_CONTENT, input.prior?.fields), aliases: [SlugSchema.parse("former")] };
  let content = makeMetaFixture("survivor");
  content = edge === "dependency" ? writeMetaDependsOn(content, ["former"]) : writeMetaPause(content, {
    pausedBy: SlugSchema.parse("andrew"), since: "2026-10-19T00:00:00Z", reason: "Waiting.", waitsOn: { kind: "work-unit", slug: SlugSchema.parse("former") },
    resumeNotes: null, open: false,
  });
  input.before = ruleView([removed], new Map([["slug:former", { status: "ok", result: { reference: removed.reference } }]]));
  input.after = ruleView([ruleRecord("work-item/meta", "survivor", "00000000-0000-4000-8000-000000000002", content, parseMetaRecord(content))]);
  expect(await checkMetaRemovalEdges(input)).toMatchObject([{ rule: "meta.decompose-removal-edges",
    condition: expect.stringContaining("survivor"), remedy: { text: expect.stringContaining("arc pause") } }]);
});

it.each(["incomplete", "unreadable", "malformed"] as const)("requires complete surviving edges for %s evidence", async fault => {
  const input = metaRuleInput(null, META_RULE_CONTENT, { kind: "verb", verb: "decompose" });
  const survivor = ruleRecord("work-item/meta", "survivor", "00000000-0000-4000-8000-000000000002", "# Broken\n");
  input.after = ruleView([survivor]);
  if (fault !== "malformed") input.after = { ...input.after, list: async () => ({ status: "ok", result: fault === "unreadable"
    ? { status: "unreadable", condition: "Cannot read metadata.", remedy: { text: "Restore the metadata." } }
    : { status: "complete", records: [], diagnostics: [], missed: true } }) };
  expect(await checkMetaRemovalEdges(input)).toMatchObject([{ rule: "meta.decompose-removal-edges" }]);
});
