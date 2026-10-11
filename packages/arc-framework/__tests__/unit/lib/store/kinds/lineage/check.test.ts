/** Retirement admission observes the origin's proposed inbound entries. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../../src/lib/store/index.js";
import { createKindRegistry } from "../../../../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { checkLineageRecord } from "../../../../../../src/lib/store/kinds/lineage/check.js";
import { writeLineageRecord, parseLineageRecord } from "../../../../../../src/lib/store/kinds/lineage/index.js";
import type { WriteCheckInput } from "../../../../../../src/lib/store/write-check.js";
import { META_RULE_UID } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
const grammar = { shape: "heading" as const, sections: ["Entries"] };
const held = "# Inbound\n\n## Entries\n\n### Concern\n\n- _Id:_ `11111111`\n\nConcern.\n";
function input(body: string | null = held, kind: "abandon" | "decompose" | "rename" = "abandon", uid: string | null = META_RULE_UID): WriteCheckInput {
  const bytes = writeLineageRecord({ schemaVersion: 2, origin: { name: OwnerIdentitySchema.parse({ type: "work-item", name: "example" }).name, ...(uid === null ? {} : { uid }) }, kind,
    successors: kind === "abandon" ? [] : [{ name: OwnerIdentitySchema.parse({ type: "work-item", name: "successor" }).name }], incoming: [],
    ...(kind === "decompose" ? { outgoing: [] } : {}) });
  const record = ruleRecord("lineage/transition", "example", META_RULE_UID, bytes, parseLineageRecord(bytes));
  const inbound = body === null ? [] : [ruleRecord("work-item/inbound", "example", META_RULE_UID, body)];
  return { reference: record.reference, writer: { kind: "verb", verb: kind }, before: ruleView(inbound), after: ruleView([record, ...inbound]),
    next: { content: bytes, fields: record.fields } };
}
it.each(["abandon", "decompose", "rename"] as const)("refuses %s retirement with held entries under a declared grammar", async (kind) => {
  expect(await checkLineageRecord(input(held, kind), grammar)).toMatchObject([{ rule: "lineage.inbound-held" }]);
});
it("refuses unavailable proposed inbound evidence", async () => {
  const proposal = input();
  proposal.after = { ...proposal.after, read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item", condition: "Inbound unavailable.", remedy: { text: "Restore reader." } } }) };
  expect(await checkLineageRecord(proposal, grammar)).toMatchObject([{ rule: "lineage.inbound-held", condition: "Inbound unavailable." }]);
});
it.each([null, "# Inbound\n\n## Entries\n"])("admits retirement with no held entries (%s)", async (body) => {
  expect(await checkLineageRecord(input(body), grammar)).toEqual([]);
});
it("admits the batch that removes the last held entry", async () => {
  const proposal = input(null); proposal.before = input().before;
  expect(await checkLineageRecord(proposal, grammar)).toEqual([]);
});
it("admits retirement while the inbound kind declares no grammar", async () => {
  expect(await checkLineageRecord(input())).toEqual([]);
});
it("checks a pre-import origin by its current name", async () => {
  expect(await checkLineageRecord(input(held, "abandon", null), grammar)).toMatchObject([{ rule: "lineage.inbound-held" }]);
});
it("does not recheck held entries on an existing lineage version", async () => {
  const proposal = input(); proposal.prior = proposal.next;
  expect(await checkLineageRecord(proposal, grammar)).toEqual([]);
});
it("registers the lineage check with the production undeclared grammar", async () => {
  const check = createKindRegistry(PRODUCTION_REGISTRATIONS)["lineage/transition"].check;
  if (check === null) throw new Error("Lineage must register its check.");
  expect(await check(input())).toEqual([]);
});
