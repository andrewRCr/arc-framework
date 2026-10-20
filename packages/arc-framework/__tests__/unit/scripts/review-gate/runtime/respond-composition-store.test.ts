/** Conditional response decisions retain the invocation's native approved fix. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalPassFixture } from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";

it("withdraws conditional authority against the supplied Store's current approved fix", async () => {
  const f = await createNativeConditionalPassFixture("frontline");
  const checkout = await createReviewCheckout(f.h);
  onTestFinished(checkout.cleanup);
  const dependencies = createRespondDependencies({ cwd: checkout.cwd, exec: checkout.exec,
    store: f.h.store, workItem: f.primary.reference.owner, projectId: f.input.readProjectId });
  const { now: ignored, ...source } = f.input.capture;
  void ignored;
  const captured = await dependencies.captureConditionalNextPass(source);
  expect(await dependencies.withdrawConditionalNextPass({ ...source,
    authorizationId: captured.authorizationId, withdrawnBy: source.authorizedBy })).toMatchObject({ state: "withdrawn" });
});
