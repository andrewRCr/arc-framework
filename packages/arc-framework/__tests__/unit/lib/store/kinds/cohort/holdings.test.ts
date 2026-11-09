/** One view resolves each cohort segment once and retains complete Parent repair context. */
import { expect, it } from "vitest";
import { observeCohortHoldings, cohortHoldingRepairs, type CohortHoldingCandidate } from "../../../../../../src/lib/store/kinds/cohort/check-support.js";
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
  expect(cohortHoldingRepairs(holdings.value, "renamed")).toMatchObject({ status: "known", value: { edits: [
    { record: { name: "elsewhere" }, field: "cohort", from: "other/child", to: null },
    { record: { name: "child" }, field: "parent", from: "group", to: "renamed" },
    { record: { name: "elsewhere" }, field: "cohort", from: null, to: "renamed/child" },
    { record: { name: "completed" }, field: "cohort", from: "group/child", to: "renamed/child" },
  ] } });
});

it("requires an ambiguous child to be disambiguated before proposing a restoration path", async () => {
  const target = cohortDoc(), first = cohortDoc("child", "group");
  const second = ruleRecord("cohort/document", "child", "00000000-0000-4000-8000-000000000099", first.content, first.fields);
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(first, "parent", "group"), candidate(second, "parent", "group"),
    candidate(held, "cohort", "group/child")], ruleView([target, first, second, held]), target.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingRepairs(holdings.value, "renamed"))
    .toMatchObject({ status: "known", value: { edits: [], deferred: [
      { condition: expect.stringMatching(/ambiguous|multiple.*generations/iu) },
      { condition: expect.stringMatching(/ambiguous|multiple.*generations/iu) },
    ] } });
  const other = cohortDoc("other", "group");
  const renamed = ruleRecord("cohort/document", "other", "00000000-0000-4000-8000-000000000099", other.content, other.fields);
  const repaired = await observeCohortHoldings([candidate(first, "parent", "group"), candidate(renamed, "parent", "group"),
    candidate(held, "cohort", "group/child")], ruleView([target, first, renamed, held]), target.reference);
  if (repaired.status !== "known") throw new Error("Expected repaired cohort holdings");
  expect(cohortHoldingRepairs(repaired.value, "renamed")).toMatchObject({ status: "known", value: { edits: expect.arrayContaining([
    expect.objectContaining({ record: expect.objectContaining({ name: "held" }), from: null, to: "renamed/child" }),
  ]) } });
});

it("keeps a closed subcohort and its stragglers with the holder retaining an ambiguous parent name", async () => {
  const first = cohortDoc(), other = ruleRecord("cohort/document", "group", "00000000-0000-4000-8000-000000000099", first.content, first.fields);
  const child = cohortDoc("child", "group", "Coordinate work.", ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01", closeout: "a" }));
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(child, "parent", "group"), candidate(held, "cohort", "group/child")],
    ruleView([first, other, child, held]), first.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingRepairs(holdings.value, "renamed")).toEqual({ status: "known", value: { edits: [], deferred: [] } });
  const openOnly = await observeCohortHoldings([candidate(held, "cohort", "group/child")],
    ruleView([first, other, child, held]), first.reference);
  if (openOnly.status !== "known") throw new Error("Expected open-only holdings");
  expect(cohortHoldingRepairs(openOnly.value, "renamed")).toEqual({ status: "known", value: { edits: [], deferred: [] } });
});

it("needs no edit when a closed subcohort's Parent and straggler path are already current", async () => {
  const target = cohortDoc(), child = cohortDoc("child", "group", "Coordinate work.",
    ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01", closeout: "a" }));
  const held = member("held", "group/child", 7);
  const holdings = await observeCohortHoldings([candidate(child, "parent", "group"), candidate(held, "cohort", "group/child")],
    ruleView([target, child, held]), target.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(cohortHoldingRepairs(holdings.value, "group")).toEqual({ status: "known", value: { edits: [], deferred: [] } });
});

it.each([false, true].flatMap(completed => ["old-parent", "another-alias"].map(prefix => ({ completed, prefix }))))(
  "plans a child's former Parent prerequisite, completed=$completed prefix=$prefix", async ({ completed, prefix }) => {
  const path = `${prefix}/child`;
  const parent = cohortDoc("parent"), child = cohortDoc("child", "old-parent"), held = member("held", path, 7, completed);
  const view = ruleView([parent, child, held]);
  const resolve: StoreView = { ...view, read: input => view.read(["old-parent", "another-alias"].includes(input.reference.owner.name)
    ? { ...input, reference: { ...input.reference, owner: parent.reference.owner } } : input) };
  const holdings = await observeCohortHoldings([candidate(held, "cohort", path)], resolve, child.reference);
  if (holdings.status !== "known") throw new Error("Expected child holdings");
  const plan = cohortHoldingRepairs(holdings.value, "child");
  expect(plan).toMatchObject({ status: "known", value: { deferred: [], edits: [
    ...completed ? [] : [{ field: "cohort", from: path, to: null }],
    { field: "parent", from: "old-parent", to: "parent" },
    { field: "cohort", from: completed ? path : null, to: "parent/child" },
  ] } });
});

it("withholds a Parent repair to a completed parent rather than advertising rejected edits", async () => {
  const parent = cohortDoc("parent", null, "Coordinate.", ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q1", sequence: "01", closeout: "a" }));
  const child = cohortDoc("child", "old-parent"), held = member("held", "old-parent/child", 7);
  const view = ruleView([parent, child, held]);
  const resolve: StoreView = { ...view, read: input => view.read(input.reference.owner.name === "old-parent"
    ? { ...input, reference: { ...input.reference, owner: parent.reference.owner } } : input) };
  const holdings = await observeCohortHoldings([candidate(held, "cohort", "old-parent/child")], resolve, child.reference);
  if (holdings.status !== "known") throw new Error("Expected child holdings");
  expect(cohortHoldingRepairs(holdings.value, "child")).toMatchObject({ status: "unavailable", condition: expect.stringMatching(/completed/iu) });
});

it.each([false, true])("plans equivalent child repairs for either complete inventory order, completed=%s", async completed => {
  const parent = cohortDoc("parent"), other = cohortDoc("other"), child = cohortDoc("child", "old-parent");
  const matching = member("matching", "old-parent/child", 7, completed), elsewhere = member("elsewhere", "other/child", 8, completed);
  const view = ruleView([parent, other, child, matching, elsewhere]);
  const resolve: StoreView = { ...view, read: input => view.read(input.reference.owner.name === "old-parent"
    ? { ...input, reference: { ...input.reference, owner: parent.reference.owner } } : input) };
  const observed = await observeCohortHoldings([candidate(matching, "cohort", "old-parent/child"),
    candidate(elsewhere, "cohort", "other/child")], resolve, child.reference);
  if (observed.status !== "known") throw new Error("Expected complete child holdings");
  const plans = [observed.value, [...observed.value].reverse()].map(holdings => cohortHoldingRepairs(holdings, "child"));
  const semantic = plans.map(plan => {
    expect(plan.status).toBe("known");
    if (plan.status !== "known") throw new Error("Expected ordered repairs");
    expect(plan.value.deferred).toEqual([]);
    expect(plan.value.edits).toHaveLength(completed ? 3 : 5);
    const parentIndex = plan.value.edits.findIndex(edit => edit.field === "parent");
    for (const [index, edit] of plan.value.edits.entries()) {
      if (edit.field !== "cohort") expect(edit).toMatchObject({ from: "old-parent", to: "parent" });
      else if (edit.to === null) expect(index).toBeLessThan(parentIndex);
      else {
        expect(edit.to).toBe("parent/child");
        expect(index).toBeGreaterThan(parentIndex);
      }
    }
    return plan.value.edits.map(edit => JSON.stringify(edit)).sort();
  });
  expect(semantic[0]).toEqual(semantic[1]);
});

it("withholds child holdings when its separate Parent alias cannot be observed", async () => {
  const parent = cohortDoc("parent"), child = cohortDoc("child", "old-parent"), held = member("held", "parent/child", 7);
  const view = ruleView([parent, child, held]);
  const resolve: StoreView = { ...view, read: input => input.reference.owner.name === "old-parent"
    ? Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort",
      condition: "The Parent alias is unreadable.", remedy: { text: "Repair Parent evidence." } } }) : view.read(input) };
  expect(await observeCohortHoldings([candidate(held, "cohort", "parent/child")], resolve, child.reference))
    .toMatchObject({ status: "unavailable", condition: "The Parent alias is unreadable." });
});

it.each([[null, "renamed"], ["root", "root/renamed"]] as const)("re-points a tied leaf to the subject's own path under Parent %s", async (parent, to) => {
  const subject = cohortDoc("child", parent), other = ruleRecord("cohort/document", "child", "00000000-0000-4000-8000-000000000099",
    cohortDoc("child", "parent").content, cohortDoc("child", "parent").fields);
  const held = member("held", "parent/child", 7), outer = cohortDoc("parent"), root = cohortDoc("root");
  const holdings = await observeCohortHoldings([candidate(held, "cohort", "parent/child")], ruleView([subject, other, held, outer, root]), subject.reference);
  if (holdings.status !== "known") throw new Error("Expected cohort holdings");
  expect(holdings.value).toMatchObject([{ resolution: "ambiguous", segment: 1 }]);
  expect(cohortHoldingRepairs(holdings.value, "renamed", parent)).toMatchObject({ status: "known", value: { edits: [
    { record: { name: "held" }, field: "cohort", from: "parent/child", to },
  ] } });
  expect(cohortHoldingRepairs(holdings.value, "renamed")).toMatchObject({ status: "known", value: { edits: [{ to: "parent/renamed" }] } });
});
