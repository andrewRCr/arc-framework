/** Private delivery targets retain branch-linked ownership independently of checkout occupancy. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { deliveryStackPlanForWorkUnitFixture } from "../../../../fixtures/delivery-plan.js";
import { createPreBindingDeliveryReviewTargetDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

it("uses the linked work branch as the originating top without a projected meta", async ({ onTestFinished }) => {
  const harness = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await harness.seedProject(projectId);
  const primary = await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  await checkout.occupy("opaque", { kind: "work-unit", name: "unrelated-holder" });
  const dependencies = createPreBindingDeliveryReviewTargetDependencies({ ...checkout, workItem: primary.reference.owner });
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  expect(await dependencies.resolveOriginatingTop(plan)).toBe("refs/heads/opaque");
  await checkout.occupy("another-branch", { kind: "work-unit", name: "example" });
  expect(await dependencies.resolveOriginatingTop(plan)).toBeNull();
});
