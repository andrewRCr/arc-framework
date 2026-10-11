/** Production cohort registration collects every applicable integrity violation. */
import { ReadPlacementSchema } from "../../../../../../src/lib/store/placement.js";
import { expect, it } from "vitest";
import { createKindRegistry } from "../../../../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { cohortDoc as doc, cohortMember as member, cohortRuleInput as input } from "../../../../../helpers/store/cohort-rule-input.js";
function check() {
  const registered = createKindRegistry(PRODUCTION_REGISTRATIONS)["cohort/document"].check;
  if (registered === null) throw new Error("A cohort check must be registered.");
  return registered;
}
it("returns all three applicable cohort rules", async () => {
  const next = doc("group", "missing", "—", ReadPlacementSchema.parse({ kind: "completed", quarter: "2026-q4" }));
  expect((await check()(input(next, doc(), [member("group")]))).map(({ rule }) => rule).sort())
    .toEqual(["cohort.open-members", "cohort.parent", "cohort.purpose"]);
});
it("returns two creation violations together", async () => {
  expect((await check()(input(doc("group", "missing", "—")))).map(({ rule }) => rule).sort()).toEqual(["cohort.parent", "cohort.purpose"]);
});
it("admits a valid cohort creation through the production registration", async () => {
  expect(await check()(input(doc("group", "parent"), null, [doc("parent"), member("parent/group")]))).toEqual([]);
});
