import { describe, expect, it } from "vitest";
import { checkReviewIntegrationBoundary } from "../../../../../../../src/lib/store/kinds/review/integration-boundary/check.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/index.js";
import { ruleView } from "../../../../../../helpers/store/rule-view.js";
import { boundaryV1Fixture, boundaryV2Fixture } from "../../../../../../fixtures/review-boundary.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example" });
async function check(value: unknown) {
  return checkReviewIntegrationBoundary({ reference: recordReferences["review/integration-boundary"](owner),
    next: { content: JSON.stringify(value), fields: value }, writer: { kind: "verb", verb: "review-resolve" },
    before: ruleView(), after: ruleView() });
}
describe("publication boundary write check", () => {
  it("refuses retained version one on write and admits current version two", async () => {
    expect(await check(boundaryV1Fixture())).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "review.integration-boundary.version" }),
    ]));
    expect(await check(boundaryV2Fixture())).toEqual([]);
  });
});
