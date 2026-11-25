/** Performed native grants lift only the original cap and retain every other opening-window closure. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeConditionalFrontlineFixture, completeNativeConditionalFrontline,
} from "../../../../fixtures/native-conditional-pass.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createRepositoryReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { frontlinePhaseClosed, settledFrontlineAdviceReader } from "../../../../../src/scripts/review-gate/policy/frontline-phase.js";
import { nativeFrontlineCapContinues } from "../../../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { publishNativeReviewPerformance } from "../../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { publishNativeConditionalWithdrawal } from "../../../../../src/scripts/review-gate/runtime/native-conditional-withdrawal.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";

async function window(perform = true) {
  const h = await createNativeConditionalFrontlineFixture(perform, 1);
  onTestFinished(h.cleanup);
  const invocation = { cwd: h.cwd, exec: h.exec, store: h.f.h.store,
    workItem: h.f.primary.reference.owner, projectId: h.f.input.readProjectId };
  const { family } = createReviewCompositionContext(invocation);
  const reader = createRepositoryReviewResultReader(h.publisher, invocation);
  const input = { repositoryId: h.target.repositoryId, lineages: [h.admission.lineage], headSha: h.target.headSha,
    readSettledFindingsAdvice: settledFrontlineAdviceReader(reader, family.ports.dispositions) };
  return { h, input, closed: () => frontlinePhaseClosed(h.operations, input) };
}

it("opens a capped window only after verified performance and closes again after the conditional clean result", async () => {
  const { h, closed } = await window(false);
  const input = { repositoryId: h.target.repositoryId, lineage: h.admission.lineage,
    producerId: h.f.outcome.attemptId, passCount: 1, headSha: h.target.headSha };
  if (h.operations.nativeFacts === undefined) throw new Error("Expected native facts");
  expect(await nativeFrontlineCapContinues(h.operations.nativeFacts, input)).toBe(false);
  await publishNativeReviewPerformance(h.performanceInput);
  expect(await nativeFrontlineCapContinues(h.operations.nativeFacts, input)).toBe(true);
  expect(await closed()).toBe(false);
  await recordLaneAttempt(h.operations, h.pendingInput);
  await completeNativeConditionalFrontline(h, "clean");
  expect(await closed()).toBe(true);
});

it("keeps a withdrawn performed-fix grant closed", async () => {
  const { h, closed } = await window();
  expect(await closed()).toBe(false);
  const { capture, ...ports } = h.f.input;
  expect(await publishNativeConditionalWithdrawal({ ...ports, inFlight: h.operations, withdrawal: {
    authorizationId: h.authorizationId, ...capture, withdrawnBy: capture.authorizedBy } })).toHaveProperty("state", "withdrawn");
  expect(await closed()).toBe(true);
});

it("keeps standard admission closed despite an otherwise live approved-fix grant", async () => {
  const { h, closed } = await window();
  expect(await closed()).toBe(false);
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target: h.target, lineage: h.admission.lineage }));
  await h.f.input.outcomes.create(outcome);
  expect(await closed()).toBe(true);
});

it.each(["head", "lineage", "producer", "count"] as const)("does not continue a capped window with a foreign %s", async field => {
  const { h } = await window();
  const facts = h.operations.nativeFacts;
  if (facts === undefined) throw new Error("Expected native facts");
  const input = { repositoryId: h.target.repositoryId, lineage: h.admission.lineage,
    producerId: h.f.outcome.attemptId, passCount: 1, headSha: h.target.headSha };
  expect(await nativeFrontlineCapContinues(facts, { ...input,
    ...(field === "head" ? { headSha: "a".repeat(40) } : field === "lineage"
      ? { lineage: { kind: "candidate" as const, candidateId: canonicalDigest({ candidate: "successor" }) } }
      : field === "producer" ? { producerId: "another-producer" } : { passCount: 2 }) })).toBe(false);
  expect(await nativeFrontlineCapContinues(facts, input)).toBe(true);
});
