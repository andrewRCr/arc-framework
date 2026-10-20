/** Native response transitions retain complete evidence requirements on replay. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeReviewPerformanceFixture } from "../../../../fixtures/native-review-performance.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { settleLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";

it.each(["dispositionSetId", "producedHeadSha", "predecessorDispositionSetId"] as const)(
  "refuses a partial %s settlement replay and continues with complete evidence", async field => {
    const f = await createNativeReviewPerformanceFixture("errand", { noFix: true });
    const performed = await publishNativeReviewPerformance(f.input);
    const checkout = await createReviewCheckout(f.h);
    onTestFinished(checkout.cleanup);
    const operations = createReviewCompositionContext({ ...checkout, workItem: f.primary.reference.owner }).family.ports.inFlight;
    const coordinates = { lane: f.outcome.lane, repositoryId: f.outcome.target.repositoryId,
      headSha: f.outcome.target.headSha, lineage: f.outcome.lineage, attemptId: f.outcome.attemptId,
      now: "2026-10-20T15:00:00Z" };
    const partial = field === "producedHeadSha" ? { producedHeadSha: f.input.performance.producedHeadSha }
      : { [field]: f.input.performance.dispositionSetId };
    await expect(settleLaneAttempt(operations, { ...coordinates, ...partial })).rejects.toThrow("complete response-performance evidence");
    expect(await f.ports.evidence.read(f.input.performance.dispositionSetId)).toEqual(performed);
    expect(await settleLaneAttempt(operations, { ...coordinates, dispositionSetId: f.input.performance.dispositionSetId,
      producedHeadSha: f.input.performance.producedHeadSha })).toMatchObject({ attempts: [{ outcome: "settled-findings" }] });
    expect(await f.ports.evidence.read(f.input.performance.dispositionSetId)).toEqual(performed);
  });
