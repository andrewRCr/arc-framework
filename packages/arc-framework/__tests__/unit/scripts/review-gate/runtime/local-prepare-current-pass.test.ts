/** Local admission separates one pass's fallback sources from the owner's complete history. */
import { expect, it } from "vitest";
import { createLocalContinuationFixture } from "../../../../fixtures/local-review-continuation.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { bindJudgment } from "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";
import { assertEvidenceBoundReviewExecutionAdmission } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { deriveReviewNextPassContextFromAttempts } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";

async function fixture() {
  const h = await createLocalContinuationFixture();
  h.dependencies.validatePolicyAdmission = async input => {
    const target = { repository: "owner/repository", pullRequest: null, headSha: input.target.headSha };
    const { ceilingOverride, additionalPassAuthorization } = bindJudgment({ target, judgment: input.judgment });
    const dispositionStore = { readDispositionRecord: async () => null };
    const nextPassContext = await deriveReviewNextPassContextFromAttempts({ ...input,
      currentTarget: input.target, currentLineage: input.lineage, resultReader: h.resultReader, dispositionStore,
      readResponsePerformance: async () => null,
    });
    const resolution = await assertEvidenceBoundReviewExecutionAdmission({ schemaVersion: 1,
      target, lane: "standard", standardReview: input.standardReview, completedPasses: input.completedPasses,
      attempts: input.attempts, scopeSelection: { mode: "whole-target", target },
      invocation: { mode: "force", sourceId: "delegated-agent" },
      ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
      ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
    }, { terminalResponsePerformed: input.terminalResponsePerformed },
    { sourceId: "delegated-agent", nextAction: "local-prepare" }, {
      sources: ["delegated-agent"], maxPasses: 2, nextPassContext, resultReader: h.resultReader,
      dispositionStore, confirmTarget: async target => target,
    });
    return { state: "ready", pass: resolution.payload.pass, coverageAdmission: { requestedCoverage: "complete" } };
  };
  return h;
}

it("admits a third authorized same-head complete pass and replays it without losing prior passes", async () => {
  const h = await fixture();
  let previous = h.original;
  await h.conclude(previous, "clean");
  for (const pass of [2, 3]) {
    const request = { ...h.input, policyJudgment: { scopeMode: "whole-target", additionalPassAuthorization: {
      headSha: previous.target.headSha, precedingProducerId: previous.operationId,
      completedPasses: pass - 1, nextPass: pass,
    } } };
    const prepared = await prepareLocalReview(request, h.dependencies);
    expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
    if (prepared.state !== "ready") throw new Error("Expected the authorized next pass");
    const state = h.published();
    if (state?.kind !== "local-review") throw new Error("Expected local operation");
    expect(state.logicalPass).toBe(pass);
    expect(state.operationId).not.toBe(previous.operationId);
    const beforeReplay = [...h.operations.values()];
    expect(await prepareLocalReview(request, h.dependencies)).toMatchObject({ state: "ready",
      payload: { operationId: state.operationId } });
    expect([...h.operations.values()]).toEqual(beforeReplay);
    await h.conclude(state, "clean");
    expect(await prepareLocalReview(request, h.dependencies)).toMatchObject({ state: "review-complete",
      payload: { operationId: state.operationId } });
    previous = state;
  }
  const history = h.laneProgress();
  if (history?.kind !== "lane-progress") throw new Error("Expected full lane history");
  expect(history.completedPasses).toBe(3);
  expect(history.attempts.map(attempt => attempt.logicalPass)).toEqual([1, 2, 3]);
  expect(history.attempts.every(attempt => attempt.local?.requestedCoverage === "complete")).toBe(true);
});


it("refuses duplicate fallback sources within the current logical pass", async () => {
  const h = await fixture();
  await h.conclude(h.original, "clean");
  for (const retryGeneration of [0, 1]) {
    await recordLaneAttempt(h.dependencies.operationStore, { lane: "standard", repositoryId: h.original.repositoryId,
      changeRequestId: null, headSha: h.original.target.headSha, lineage: h.original.lineage,
      attemptId: `unavailable-${retryGeneration}`, sourceId: "delegated-agent", outcome: "transient-unavailable",
      consumedPass: false, logicalPass: 2, retryGeneration, now: h.dependencies.now() });
  }
  const before = [...h.operations.values()];
  await expect(prepareLocalReview({ ...h.input, policyJudgment: { additionalPassAuthorization: {
    headSha: h.original.target.headSha, precedingProducerId: h.original.operationId, completedPasses: 1, nextPass: 2,
  } } }, h.dependencies)).rejects.toThrow(/ordered unique subsequence/u);
  expect([...h.operations.values()]).toEqual(before);
});

it("refuses additional-pass authority naming a foreign head without recording another attempt", async () => {
  const h = await fixture();
  await h.conclude(h.original, "clean");
  const before = [...h.operations.values()];
  await expect(prepareLocalReview({ ...h.input, policyJudgment: { additionalPassAuthorization: {
    headSha: "e".repeat(40), precedingProducerId: h.original.operationId, completedPasses: 1, nextPass: 2,
  } } }, h.dependencies)).rejects.toMatchObject({ name: "ReviewDriverAdmissionError", state: "invalid-override",
    reason: "target-mismatch" });
  expect([...h.operations.values()]).toEqual(before);
});
