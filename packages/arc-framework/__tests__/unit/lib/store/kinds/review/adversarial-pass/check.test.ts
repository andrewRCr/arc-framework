import { describe, expect, it } from "vitest";
import { checkReviewAdversarialPass } from "../../../../../../../src/lib/store/kinds/review/adversarial-pass/check.js";
import { ReviewAdversarialPassSchema } from "../../../../../../../src/lib/store/kinds/review/adversarial-pass/schema.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { adversarialPassFixture } from "../../../../../../fixtures/review-adversarial-pass.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
async function check(activity: string, number: number) {
  const value = ReviewAdversarialPassSchema.parse(adversarialPassFixture());
  return checkReviewAdversarialPass({ reference: recordReferences["review/adversarial-pass"](owner, { activity, number }),
    next: { content: JSON.stringify(value), fields: value }, writer: { kind: "verb", verb: "review-adversarial-record" },
    before: ruleView(), after: ruleView() });
}
describe("adversarial pass write check", () => {
  it("binds the key's activity while counting stored passes independently of loops", async () => {
    expect(await check("task-generation", 9)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.adversarial-pass.key" }),
    ]));
    expect(await check("draft-readiness", 9)).toEqual([]);
  });
});
