/** Held-inbound transitions use the proposed batch and an explicitly supplied grammar. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../../../../../src/lib/kernel/index.js";
import { checkMetaInboundHeld } from "../../../../../../src/lib/store/kinds/meta/inbound-held-rule.js";
import type { EntryListConfig } from "../../../../../../src/lib/store/concurrency/entries.js";
import type { ReadPlacement, WriteCheckInput } from "../../../../../../src/lib/store/index.js";
import { META_RULE_CONTENT as content, META_RULE_UID as uid, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
const grammar: EntryListConfig = { shape: "heading", sections: ["Entries"] };
const held = "# Inbound\n\n## Entries\n\n### Concern\n\n- _Id:_ `11111111`\n\nAuthored concern.\n";
const integrating = content.replace("`Active`", "`Integrating`").replace("`process-task-loop`", "`integrate-work-unit`");
const archived = content.replace("`Active`", "`Shipped`").replace("`process-task-loop`", "[none]");
const completed: ReadPlacement = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4"), sequence: ArchiveSequenceSchema.parse("01") };
function inputFor(next: string, prior: string = content, inbound: string | null = held,
  placement: ReadPlacement = { kind: "active" }, priorPlacement: ReadPlacement = { kind: "active" }): WriteCheckInput {
  const input = metaRuleInput(next, prior);
  input.before = ruleView([ruleRecord("work-item/meta", "example", uid, prior, input.prior?.fields, priorPlacement),
    ruleRecord("work-item/inbound", "example", uid, held)]);
  const records = [ruleRecord("work-item/meta", "example", uid, next, input.next?.fields, placement)];
  if (inbound !== null) records.push(ruleRecord("work-item/inbound", "example", uid, inbound));
  input.after = ruleView(records);
  return input;
}
describe("metadata held inbound entries", () => {
  it.each(["integrate", "archive"])("refuses held entries at %s", async (transition) => {
    const input = transition === "archive" ? inputFor(archived, content, held, completed) : inputFor(integrating);
    expect(await checkMetaInboundHeld(input, grammar)).toMatchObject([{ rule: "meta.inbound-held" }]);
  });
  it("refuses a proved archive move despite an unparseable prior's fields", async () => {
    expect(await checkMetaInboundHeld(inputFor(archived, "# Broken\n", held, completed), grammar))
      .toMatchObject([{ rule: "meta.inbound-held" }]);
  });
  it("refuses unavailable inbound evidence", async () => {
    const input = inputFor(integrating), read = input.after.read;
    input.after = { ...input.after, read: async (request) => request.reference.kind === "work-item/inbound"
      ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
        condition: "Inbound observation unavailable", remedy: { text: "Repair and retry." } } } : read(request) };
    expect(await checkMetaInboundHeld(input, grammar)).toMatchObject([{ rule: "meta.inbound-held" }]);
  });
  it("refuses unavailable placement evidence", async () => {
    const input = inputFor(archived, content, held, completed);
    input.before = { ...input.before, read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: "work-item", condition: "Prior placement unavailable", remedy: { text: "Repair and retry." } } }) };
    expect(await checkMetaInboundHeld(input, grammar)).toMatchObject([{ rule: "meta.inbound-held" }]);
  });
  it.each([null, "# Inbound\n\n## Entries\n\nNo held concern.\n"])("admits a removed or empty resulting list", async (bytes) => {
    expect(await checkMetaInboundHeld(inputFor(integrating, content, bytes), grammar)).toEqual([]);
  });
  it("admits archive after the last inbound entry is removed in the batch", async () => {
    expect(await checkMetaInboundHeld(inputFor(archived, content, null, completed), grammar)).toEqual([]);
  });
  it("admits while no grammar is declared without needing observations", async () => {
    const input = inputFor(integrating);
    input.after = { ...input.after, read: async () => { throw new Error("No grammar supplies no observation obligation"); } };
    expect(await checkMetaInboundHeld(input)).toEqual([]);
  });
  it("admits an unrelated write preserving a held entry in Integrating", async () => {
    expect(await checkMetaInboundHeld(inputFor(`${integrating}\n## Notes\n\nEdit.\n`, integrating), grammar)).toEqual([]);
  });
  it("admits an unrelated write preserving a held entry in archive", async () => {
    expect(await checkMetaInboundHeld(inputFor(`${archived}\n## Notes\n\nEdit.\n`, archived, held, completed, completed), grammar)).toEqual([]);
  });
  it("admits field repairs without readable prior evidence", async () => {
    expect(await checkMetaInboundHeld(inputFor(integrating, "# Broken\n"), grammar)).toEqual([]);
  });
  it("admits a write outside either transition", async () => {
    expect(await checkMetaInboundHeld(inputFor(content), grammar)).toEqual([]);
  });
});

it("refuses activation while inbound is held and admits once cleared", async () => {
  const planning = content.replace("`Active`", "`Planning`");
  expect(await checkMetaInboundHeld(inputFor(content, planning), grammar)).toMatchObject([{ rule: "meta.inbound-held" }]);
  expect(await checkMetaInboundHeld(inputFor(content, planning, null), grammar)).toEqual([]);
});
