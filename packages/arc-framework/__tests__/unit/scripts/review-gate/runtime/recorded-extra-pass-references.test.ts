/** A supplied ordinary extra-pass reference must name the recorded decision whose values its grant states. */
import { expect, it } from "vitest";
import { ReviewDecisionSchema } from "../../../../../src/lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { requireRecordedExtraPassReferences } from "../../../../../src/scripts/review-gate/runtime/native-extra-pass-input.js";
import { extraPassDecision } from "../../../../fixtures/review-decision.js";

const recorded = ReviewDecisionSchema.parse(extraPassDecision("additional"));
const read = async (key: string) => key === reviewDecisionKey(recorded) ? recorded : null;
const additional = { completedPasses: 2, precedingProducerId: "producer-1", decisionKey: reviewDecisionKey(recorded) };

it("admits an additional-pass reference whose recorded decision carries the grant's count and preceding producer", async () => {
  await expect(requireRecordedExtraPassReferences({ additionalPassAuthorization: additional }, read)).resolves.toBeUndefined();
});

it.each([
  ["preceding producer", { ...additional, precedingProducerId: "producer-2" }],
  ["pass count", { ...additional, completedPasses: 3 }],
])("refuses an additional-pass reference whose recorded decision has another %s", async (_field, grant) => {
  await expect(requireRecordedExtraPassReferences({ additionalPassAuthorization: grant }, read)).rejects
    .toMatchObject({ code: "invalid-input", message: expect.stringContaining("does not match the supplied grant values") });
});

it("refuses a ceiling reference naming an additional-pass decision", async () => {
  await expect(requireRecordedExtraPassReferences({ ceilingOverride: { exhaustedPassCount: 2,
    decisionKey: reviewDecisionKey(recorded) } }, read)).rejects.toMatchObject({ code: "invalid-input",
    message: expect.stringContaining("does not match the supplied grant values") });
});
