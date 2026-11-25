/** Native pending records follow stable vehicle owners while exact targets retain their own head. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../../helpers/store/review-checkout.js";
import { createHostedHandleFixture } from "../../../../../fixtures/hosted-review.js";
import { localOutcome } from "../../../../../fixtures/review-outcome.js";
import { createReviewCompositionContext } from "../../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { recordLaneAttempt } from "../../../../../../src/scripts/review-gate/lane-progress.js";
import { LaneAttemptSchema } from "../../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { ReviewOutcomeSchema, type ReviewOutcome } from "../../../../../../src/lib/store/kinds/review/outcome/schema.js";

it.each(["errand", "review-target"] as const)("retains the native %s lane's expected record identity across a head change", async vehicleKind => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const { family, publisher } = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  if (family.mode !== "stored") throw new Error("Expected native fact ports");
  const first = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const { targetId: ignored, ...coordinates } = first;
  void ignored;
  const second = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const producer = (target: typeof first, logicalPass: number) => ReviewOutcomeSchema.parse(JSON.parse(JSON.stringify(localOutcome({ target,
    logicalPass, lineage: { kind: "head-bound", vehicleKind,
      vehicleIdentity: vehicleKind === "errand" ? "1".repeat(32) : target.targetId, headSha: target.headSha },
    vehicle: vehicleKind === "errand" ? { kind: "errand", identity: "repair", claimId: "1".repeat(32) }
      : { kind: "work-unit", identity: "example" } }))));
  const admit = (outcome: ReviewOutcome) => recordLaneAttempt(family.ports.inFlight, { lane: "standard",
    repositoryId: projectId, headSha: outcome.target.headSha, lineage: outcome.lineage, attemptId: outcome.attemptId,
    logicalPass: outcome.logicalPass, retryGeneration: outcome.retryGeneration, changeRequestId: null,
    sourceId: outcome.source.sourceId, outcome: "pending", consumedPass: false,
    local: LaneAttemptSchema.shape.local.unwrap().strip().parse({ ...outcome.local, effectiveCoverage: null }),
    now: "2026-10-20T12:00:00Z" });
  const ended = producer(first, 1), admitted = await admit(ended);
  const retained = await publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  expect(retained).toHaveLength(1);
  await family.ports.outcomes.create(ended);
  const afterEnd = await family.ports.inFlight.readOperation(admitted.operationId);
  if (afterEnd.state === null) throw new Error("Expected the completed lane");
  await family.ports.inFlight.publishOperation(afterEnd.state, afterEnd.version);
  const pending = producer(second, vehicleKind === "errand" ? 2 : 1), next = await admit(pending);
  const records = await publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  expect(records).toHaveLength(vehicleKind === "errand" ? 1 : 2);
  expect(records.map(record => record.name)).toContain(retained[0]!.name);
  expect(next.operationId === admitted.operationId).toBe(vehicleKind === "errand");
  expect(next.attempts.map(attempt => attempt.headSha)).toEqual(vehicleKind === "errand"
    ? [first.headSha, second.headSha] : [second.headSha]);
  expect(await family.ports.inFlight.readOperation(next.operationId)).toMatchObject({
    version: vehicleKind === "errand" ? 3 : 1, state: { completedPasses: vehicleKind === "errand" ? 1 : 0 } });
});
