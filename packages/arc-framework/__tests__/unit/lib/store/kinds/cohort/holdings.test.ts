/** One view resolves each cohort segment once and retains complete Parent repair context. */
import { expect, it } from "vitest";
import { observeCohortHoldings, cohortHoldingEdits, type CohortHoldingCandidate } from "../../../../../../src/lib/store/kinds/cohort/check-support.js";
import type { StoreRecord } from "../../../../../../src/lib/store/read.js";
import type { StoreView } from "../../../../../../src/lib/store/write-check.js";
import { ReadPlacementSchema } from "../../../../../../src/lib/store/placement.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
import { cohortDoc } from "../../../../../helpers/store/cohort-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";

function member(name: string, path: string, id: number, completed = false): StoreRecord {
  const bytes = makeMetaFixture(name, { cohort: path });
  return ruleRecord("work-item/meta", name, `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, bytes,
    parseMetaRecord(bytes), completed ? ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01" }) : { kind: "active" });
}
function candidate(record: StoreRecord, field: "cohort" | "parent", path: string): CohortHoldingCandidate {
  return { reference: record.reference, field, path, completed: record.placement?.kind === "completed" };
}

it.each(["other", "absent", "Not A Slug"])("counts no holding from %s beside a proved member", async path => {
  const target = cohortDoc(), other = cohortDoc("other"), held = member("held", "group", 7), outside = member("outside", path, 8);
  const proved = candidate(held, "cohort", "group");
  expect(await observeCohortHoldings([proved, candidate(outside, "cohort", path)], ruleView([target, other, held, outside]), target.reference))
    .toMatchObject({ status: "known", value: [{ candidate: proved, resolution: "sole" }] });
});

it("resolves repeated parent and child segments once in its view", async () => {
  const target = cohortDoc(), child = cohortDoc("child", "group");
  const first = member("first", "group/child", 7), second = member("second", "group/child", 8);
  const view = ruleView([target, child, first, second]);
  let reads = 0;
  const resolve: StoreView = { ...view, read: async input => { reads++; return view.read(input); } };
  const result = await observeCohortHoldings([candidate(first, "cohort", "group/child"), candidate(second, "cohort", "group/child")], resolve, target.reference);
  expect(result).toMatchObject({ status: "known", value: [{ resolution: "sole", segment: 0 }, { resolution: "sole", segment: 0 }] });
  expect(reads).toBe(2);
});

it("withholds the whole observation when even a nonholding segment cannot be read", async () => {
  const target = cohortDoc(), held = member("held", "group", 7), outside = member("outside", "missing", 8);
  const view = ruleView([target, held, outside]);
  const resolve: StoreView = { ...view, read: input => input.reference.owner.name === "missing"
    ? Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort",
      condition: "The named cohort is unreadable.", remedy: { text: "Repair the unreadable cohort, then retry." } } }) : view.read(input) };
  expect(await observeCohortHoldings([candidate(held, "cohort", "group"), candidate(outside, "cohort", "missing")], resolve, target.reference))
    .toMatchObject({ status: "unavailable", condition: "The named cohort is unreadable." });
});

it("retains a Parent's child members even when their first segment names another parent", async () => {
  const target = cohortDoc(), child = cohortDoc("child", "group"), other = cohortDoc("other");
  const open = member("elsewhere", "other/child", 7), completed = member("completed", "group/child", 8, true);
  const parent = candidate(child, "parent", "group"), elsewhere = candidate(open, "cohort", "other/child");
  const ended = candidate(completed, "cohort", "group/child");
  const holdings = await observeCohortHoldings([parent, elsewhere, ended], ruleView([target, child, other, open, completed]), target.reference);
  expect(holdings)
    .toMatchObject({ status: "known", value: [
      { candidate: parent, members: [{ candidate: elsewhere }, { candidate: ended }] }, { candidate: ended },
    ] });
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingEdits(holdings.value, "renamed")).toMatchObject({ status: "known", value: [
    { record: { name: "elsewhere" }, field: "cohort", from: "other/child", to: null },
    { record: { name: "child" }, field: "parent", from: "group", to: "renamed" },
    { record: { name: "elsewhere" }, field: "cohort", from: null, to: "renamed/child" },
    { record: { name: "completed" }, field: "cohort", from: "group/child", to: "renamed/child" },
  ] });
});

it("requires an ambiguous child to be disambiguated before proposing a restoration path", async () => {
  const target = cohortDoc(), first = cohortDoc("child", "group");
  const second = ruleRecord("cohort/document", "child", "00000000-0000-4000-8000-000000000099", first.content, first.fields);
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(first, "parent", "group"), candidate(second, "parent", "group"),
    candidate(held, "cohort", "group/child")], ruleView([target, first, second, held]), target.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingEdits(holdings.value, "renamed"))
    .toMatchObject({ status: "unavailable", condition: expect.stringMatching(/ambiguous|multiple.*generations/iu) });
  const other = cohortDoc("other", "group");
  const renamed = ruleRecord("cohort/document", "other", "00000000-0000-4000-8000-000000000099", other.content, other.fields);
  const repaired = await observeCohortHoldings([candidate(first, "parent", "group"), candidate(renamed, "parent", "group"),
    candidate(held, "cohort", "group/child")], ruleView([target, first, renamed, held]), target.reference);
  if (repaired.status !== "known") throw new Error("Expected repaired cohort holdings");
  expect(cohortHoldingEdits(repaired.value, "renamed")).toMatchObject({ status: "known", value: expect.arrayContaining([
    expect.objectContaining({ record: expect.objectContaining({ name: "held" }), from: null, to: "renamed/child" }),
  ]) });
});

it("keeps a closed subcohort and its stragglers with the holder retaining an ambiguous parent name", async () => {
  const first = cohortDoc(), other = ruleRecord("cohort/document", "group", "00000000-0000-4000-8000-000000000099", first.content, first.fields);
  const child = cohortDoc("child", "group", "Coordinate work.", ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01", closeout: "a" }));
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(child, "parent", "group"), candidate(held, "cohort", "group/child")],
    ruleView([first, other, child, held]), first.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingEdits(holdings.value, "renamed")).toEqual({ status: "known", value: [] });
  const openOnly = await observeCohortHoldings([candidate(held, "cohort", "group/child")],
    ruleView([first, other, child, held]), first.reference);
  if (openOnly.status !== "known") throw new Error("Expected open-only holdings");
  expect(cohortHoldingEdits(openOnly.value, "renamed")).toEqual({ status: "known", value: [] });
});

it("needs no edit when a closed subcohort's Parent and straggler path are already current", async () => {
  const target = cohortDoc(), child = cohortDoc("child", "group", "Coordinate work.",
    ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01", closeout: "a" }));
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(child, "parent", "group"), candidate(held, "cohort", "group/child")],
    ruleView([target, child, held]), target.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingEdits(holdings.value, "group")).toEqual({ status: "known", value: [] });
});
