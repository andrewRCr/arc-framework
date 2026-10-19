/** Native review ownership follows repository-qualified branch links without projected metadata. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { readLocalReviewLiveContext } from "../../../../../../src/scripts/review-gate/hosts/local/live-context.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
it("resolves an adopted branch's stored work unit with no Branch field or meta file", async ({ onTestFinished }) => {
  const harness = createReviewHarness();
  await harness.seedProject(projectId);
  const branch = "topic/opaque";
  await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  const checkout = await createReviewCheckout(harness, { script: [
    { match: ["show-ref", "--exists", "refs/arc/user/test-user/errands"], responses: [{ failure: { exitCode: 2 } }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, { kind: "work-unit", name: "example" });
  expect(await readLocalReviewLiveContext(checkout)).toMatchObject({
    context: { activeIdentity: "test-user", workUnit: { identity: "example", owner: "test-user" }, errand: null },
    meta: { branch: null, workClass: "Light" },
  });
});
