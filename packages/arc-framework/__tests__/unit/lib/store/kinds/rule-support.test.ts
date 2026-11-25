/** Named observations preserve ambiguity without broadening existing record observations. */
import { expect, it } from "vitest";
import { observeNamedRecord, observeRecord } from "../../../../../src/lib/store/kinds/rule-support.js";
import { ruleRecord, ruleView } from "../../../../helpers/store/rule-view.js";
import { RecordReferenceSchema } from "../../../../../src/lib/store/identity.js";

it("retains the named refusal's candidates, tier, and remedy while exact observation stays unavailable", async () => {
  const records = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]
    .map(uid => ruleRecord("cohort/document", "shared", uid));
  const view = ruleView(records);
  const reference = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "shared" } });
  const read = await view.read({ reference });
  if (read.status !== "refused" || read.refusal.code !== "ambiguous-match") throw new Error("Expected named ambiguity");
  expect(await observeNamedRecord(view, reference)).toEqual({ status: "ambiguous", condition: read.refusal.condition,
    candidates: read.refusal.candidates, tie: read.refusal.tie, remedy: read.refusal.remedy });
  expect(await observeRecord(view, reference)).toEqual({ status: "unavailable", condition: read.refusal.condition });
});
