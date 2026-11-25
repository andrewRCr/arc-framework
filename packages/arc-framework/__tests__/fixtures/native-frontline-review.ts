/** Actual admitted frontline execution over portable facts and checkout-local pending storage. */
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import { createFrontlineMappingFixture } from "./review-mapping.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { recordLaneAttempt } from "../../src/scripts/review-gate/lane-progress.js";
import { bindNativeReviewPorts } from "../helpers/store/native-review-ports.js";

export async function nativeFrontlineReview(result: "clean" | "findings" = "findings") {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  try {
    const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
    const { inFlight: operations, outcomes } = bindNativeReviewPorts({ store: h.store, owner: primary.reference.owner,
      publisher, projectId: h.projectId });
    const { fixture } = await createFrontlineMappingFixture(projectId, result);
    const { admission } = fixture;
    await recordLaneAttempt(operations, { lane: "frontline", repositoryId: projectId, changeRequestId: null,
      headSha: admission.target.headSha, lineage: admission.lineage, logicalPass: admission.logicalPass,
      retryGeneration: admission.retryGeneration, attemptId: admission.operationId,
      sourceId: fixture.outcomeRecord.sourceIdentity, outcome: "pending", consumedPass: false,
      frontline: { admission, effectiveCoverage: null }, now: "2026-10-20T12:00:00Z" });
    return { ...checkout, primary, publisher, outcomes, operations, fixture };
  } catch (error) { await checkout.cleanup(); throw error; }
}

