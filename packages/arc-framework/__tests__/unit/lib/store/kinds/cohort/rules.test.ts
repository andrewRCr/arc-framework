/** Cohort integrity is checked against the proposed complete batch. */
import { CohortReadPlacementSchema } from "../../../../../../src/lib/store/placement.js";
import { describe, expect, it } from "vitest";
import { checkCohortPurpose, checkCohortParent, checkCohortOpenMembers } from "../../../../../../src/lib/store/kinds/cohort/rules.js";
import { cohortDoc as doc, cohortMember as member, cohortRuleInput as input } from "../../../../../helpers/store/cohort-rule-input.js";
const complete = CohortReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4", sequence: "01", closeout: "a" });
describe("Purpose floor", () => {
  it.each([null, "", "—"])("refuses a new Purpose %s", (purpose) => expect(checkCohortPurpose(input(doc("group", null, purpose))))
    .toMatchObject([{ rule: "cohort.purpose" }]));
  it("refuses removing an authored Purpose", () => expect(checkCohortPurpose(input(doc("group", null, "—"), doc())))
    .toMatchObject([{ rule: "cohort.purpose" }]));
});
describe("Parent integrity", () => {
  it("refuses an absent named parent", async () => expect(await checkCohortParent(input(doc("group", "parent"))))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("refuses a completed named parent", async () => expect(await checkCohortParent(input(doc("group", "parent"), null, [doc("parent", null, "Authored.", complete)])))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("refuses a parent already nested", async () => expect(await checkCohortParent(input(doc("group", "parent"), null, [doc("parent", "root"), doc("root")])))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("counts own open subcohorts when nesting", async () => expect(await checkCohortParent(input(doc("group", "parent"), null, [doc("parent"), doc("child", "group")])))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("refuses reparenting with an unsettled direct member path", async () => expect(await checkCohortParent(input(doc("group", "parent"), doc(), [doc("parent"), member("group")])))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("refuses a nested member path disagreeing with the new top-level Parent", async () => expect(await checkCohortParent(input(doc(), null, [member("parent/group")])))
    .toMatchObject([{ rule: "cohort.parent" }]));
  it("refuses a member naming an undeclared child below the cohort", async () => expect(await checkCohortParent(input(doc(), null, [member("group/child")])))
    .toMatchObject([{ rule: "cohort.parent" }]));
});
describe("open-member retention", () => {
  it.each([null, doc("group", null, "Authored.", complete)])("refuses closing with an open direct member", async (next) => {
    expect(await checkCohortOpenMembers(input(next, doc(), [member("group")]))).toMatchObject([{ rule: "cohort.open-members" }]);
  });
  it("refuses removal with an open nested member", async () => expect(await checkCohortOpenMembers(input(null, doc(), [member("group/child")])))
    .toMatchObject([{ rule: "cohort.open-members" }]));
  it("refuses removal with an open subcohort", async () => expect(await checkCohortOpenMembers(input(null, doc(), [doc("child", "group")])))
    .toMatchObject([{ rule: "cohort.open-members" }]));
});
describe("valid cohort writes and legacy repairs", () => {
  it.each([
    ["new authored Purpose", doc(), null],
    ["repair a placeholder Purpose", doc(), doc("group", null, "—")],
    ["retain a stale Purpose during a prose edit", { ...doc("group", null, "—"), content: `${doc("group", null, "—").content}\nProse.\n` }, doc("group", null, "—")],
    ["repair malformed prior content", doc(), { ...doc(), content: "**Parent:** bad\n" }],
    ["remove a document", null, doc()],
  ])("admits %s", (_name, next, prior) => expect(checkCohortPurpose(input(next, prior))).toEqual([]));
  it.each([
    ["top-level creation", doc(), null, []],
    ["a parent with no completed placement", doc("group", "parent"), null, [doc("parent"), member("parent/group")]],
    ["settled member reparenting", doc("group", "parent"), doc(), [doc("parent"), member("parent/group")]],
    ["a top-level cohort with a consistent open child", doc(), null, [doc("child", "group"), member("group/child")]],
    ["completed children excluded from nesting depth", doc("group", "parent"), null, [doc("parent"), doc("child", "group", "Authored.", complete)]],
    ["completed members excluded from agreement", doc("group", "parent"), null, [doc("parent"), member("group", true)]],
    ["unrelated members", doc(), null, [member("other")]],
    ["stale unchanged Parent", { ...doc("group", "parent"), content: `${doc("group", "parent").content}\nProse.\n` }, doc("group", "parent"), []],
    ["malformed prior Parent repair", doc(), { ...doc(), content: "**Parent:** bad\n" }, []],
  ] as const)("admits Parent writes for %s", async (_name, next, prior, after) => expect(await checkCohortParent(input(next, prior, after))).toEqual([]));
  it.each([
    ["empty document removal", null, doc(), []],
    ["archive with the last completed member", doc("group", null, "Authored.", complete), doc(), [member("group", true)]],
    ["removal with the last completed child", null, doc(), [doc("child", "group", "Authored.", complete)]],
    ["member leaves in the same batch", null, doc(), [member(null)]],
    ["unrelated open member", null, doc(), [member("other")]],
    ["no completed placement", doc(), doc(), [member("group")]],
    ["unchanged completed placement", doc("group", null, "Authored.", complete), doc("group", null, "Authored.", complete), [member("group")]],
  ] as const)("admits retention writes for %s", async (_name, next, prior, after) => expect(await checkCohortOpenMembers(input(next, prior, after))).toEqual([]));
});
describe("incomplete proposed observations", () => {
  it.each(["parent", "retention"])("refuses an incomplete %s family enumeration", async (rule) => {
    const proposal = rule === "parent" ? input(doc()) : input(null, doc());
    proposal.after = { ...proposal.after, list: async () => ({ status: "ok", result: { status: "complete", records: [], diagnostics: [], missed: true } }) };
    const check = rule === "parent" ? checkCohortParent : checkCohortOpenMembers;
    expect(await check(proposal)).toMatchObject([{ rule: rule === "parent" ? "cohort.parent" : "cohort.open-members", condition: expect.stringContaining("unreadable") }]);
  });
  it.each(["parent", "retention"])("refuses an unreadable %s family", async (rule) => {
    const proposal = rule === "parent" ? input(doc()) : input(null, doc());
    proposal.after = { ...proposal.after, list: async () => ({ status: "ok", result: { status: "unreadable", condition: "Family unavailable.", remedy: { text: "Repair." } } }) };
    expect(await (rule === "parent" ? checkCohortParent : checkCohortOpenMembers)(proposal))
      .toMatchObject([{ condition: "Family unavailable." }]);
  });
  it.each(["parent", "retention"])("refuses a %s listing containing malformed diagnostics", async (rule) => {
    const proposal = rule === "parent" ? input(doc()) : input(null, doc());
    proposal.after = { ...proposal.after, list: async () => ({ status: "ok", result: { status: "complete", records: [], missed: false,
      diagnostics: [{ kind: "malformed", key: "other", condition: "Invalid Parent.", remedy: { text: "Repair." } }] } }) };
    expect(await (rule === "parent" ? checkCohortParent : checkCohortOpenMembers)(proposal))
      .toMatchObject([{ condition: expect.stringContaining("malformed") }]);
  });
  it("refuses unavailable named parent reads", async () => {
    const proposal = input(doc("group", "parent"));
    proposal.after = { ...proposal.after, read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort", condition: "Parent unavailable.", remedy: { text: "Repair." } } }) };
    expect(await checkCohortParent(proposal)).toMatchObject([{ rule: "cohort.parent", condition: "Parent unavailable." }]);
  });
  it("refuses archive without prior placement evidence", async () => {
    const proposal = input(doc("group", null, "Authored.", complete), doc());
    proposal.before = { ...proposal.before, read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "cohort", condition: "Placement unavailable.", remedy: { text: "Repair." } } }) };
    expect(await checkCohortOpenMembers(proposal)).toMatchObject([{ rule: "cohort.open-members", condition: "Placement unavailable." }]);
  });
});
