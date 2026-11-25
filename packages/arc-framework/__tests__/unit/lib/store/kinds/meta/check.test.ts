/** The production meta check returns every violation and admits a valid verb write. */
import { expect, it } from "vitest";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { createKindRegistry } from "../../../../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { checkMetaRecord } from "../../../../../../src/lib/store/kinds/meta/check.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { META_RULE_CONTENT as content, META_RULE_UID, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
const ids = ["meta.verb-owned-field", "meta.field-block", "meta.durable-fields", "meta.depends-on", "meta.design-entry",
  "meta.cohort", "meta.stage", "meta.prepare-tasks", "work-item.former-slug", "work-item.slug-edges"];
const holderUID = "00000000-0000-4000-8000-000000000002";
const dependentUID = "00000000-0000-4000-8000-000000000003";
function badInput() {
  const design = "- **Design:** `spec-other.md`, `draft-other.md`, `notes-other.md`";
  const bytes = content.replace("`Active`", "`Integrating`").replace("`andrew`", "`Not a slug`")
    .replace("`process-task-loop`", "`prepare-work-unit`")
    .replace("- **Design:** `spec-example.md`", `${design}\n${design}`)
    .replace("- **Cohort:** [none]", "- **Cohort:** `missing-cohort`")
    .replace("- **Depends On:** [none]", "- **Depends On:** `missing-target`");
  const input = metaRuleInput(bytes, null);
  const holderBytes = makeMetaFixture("holder", { owner: "andrew", workClass: "Light", priority: "P1" });
  const dependentBytes = makeMetaFixture("dependent", { owner: "andrew", workClass: "Light", priority: "P1", dependsOn: ["example"] });
  const holder = ruleRecord("work-item/meta", "holder", holderUID, holderBytes, parseMetaRecord(holderBytes));
  const dependent = ruleRecord("work-item/meta", "dependent", dependentUID, dependentBytes, parseMetaRecord(dependentBytes));
  input.before = ruleView([holder, dependent], new Map([["slug:example", { status: "ok", result: { reference: holder.reference } }]]));
  input.after = ruleView([ruleRecord("work-item/meta", "example", META_RULE_UID, bytes, input.next?.fields), dependent,
    ruleRecord("work-item/inbound", "example", META_RULE_UID, "# Inbound\n\n## Inbound\n\n### Concern\n\n- _Id:_ `11111111`\n\nConcern.\n")]);
  return input;
}
it("returns every applicable violation through the production registration", async () => {
  const check = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/meta"].check;
  expect(check).toBeTypeOf("function");
  if (check === null) throw new Error("A meta check must be registered");
  expect((await check(badInput())).map(({ rule }) => rule).sort()).toEqual([...ids, "meta.inbound-held"].sort());
});
it("composes the inbound rule when its declared grammar is supplied", async () => {
  expect((await checkMetaRecord(badInput(), { shape: "heading", sections: ["Inbound"] })).map(({ rule }) => rule).sort())
    .toEqual([...ids, "meta.inbound-held"].sort());
});
it("admits a valid creation by a lifecycle verb through the production registration", async () => {
  const check = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/meta"].check;
  if (check === null) throw new Error("A meta check must be registered");
  expect(await check(metaRuleInput(content, null, { kind: "verb", verb: "start" }))).toEqual([]);
});
