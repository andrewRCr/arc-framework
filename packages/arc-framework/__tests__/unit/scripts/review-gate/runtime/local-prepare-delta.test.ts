/** Local delta admission adopts resolved coverage before publishing and replaying it. */
import { expect, it } from "vitest";
import { createLocalContinuationFixture } from "../../../../fixtures/local-review-continuation.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { resolveLocalReviewCoverageSelection } from "../../../../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { assertEvidenceBoundReviewExecutionAdmission, resolveEvidenceBoundReviewPolicyContinuation } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { prepareLocalReview, type LocalPrepareDependencies } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

async function scenario() {
  const fixture = await createLocalContinuationFixture();
  await fixture.conclude(fixture.original, "clean");
  const predecessor = await fixture.resultReader.readResult(fixture.original.operationId);
  fixture.dependencies.validatePolicyAdmission = async (input): ReturnType<LocalPrepareDependencies["validatePolicyAdmission"]> => {
    const before = predecessor.target.headSha;
    const after = input.target.headSha;
    const dispositionStore = { readDispositionRecord: async () => null,
      appendDispositionRecord: async () => { throw new Error("read-only evidence"); } };
    const nextPassContext = await deriveReviewNextPassContext({ predecessor, currentTarget: input.target,
      currentLineage: input.lineage, standardReview: input.standardReview, dispositionStore,
      resultReader: fixture.resultReader, readResponsePerformance: async () => null,
      deltaAdmission: { sources: ["delegated-agent"], surface: "pre-publication" },
      rangeProof: { cwd: "/checkout", exec: scriptGitExec([
        { match: ["rev-parse", "--verify", `${before}^{commit}`], responses: [{ stdout: before }] },
        { match: ["rev-parse", "--verify", `${after}^{commit}`], responses: [{ stdout: after }] },
        { match: ["merge-base", "--is-ancestor", before, after], responses: [{ stdout: "" }] },
        { match: ["rev-list", "--first-parent", "--merges", "--parents", `${before}..${after}`], responses: [{ stdout: "" }] },
      ]).exec },
    });
    const request = { schemaVersion: 1 as const,
      target: { repository: "owner/repository", pullRequest: null, headSha: input.target.headSha },
      lane: "standard" as const, standardReview: input.standardReview, completedPasses: input.completedPasses,
      attempts: input.attempts };
    const dependencies = { sources: ["delegated-agent"], maxPasses: 2, nextPassContext,
      resultReader: fixture.resultReader, dispositionStore, confirmTarget: async () => input.target };
    const policy = await resolveEvidenceBoundReviewPolicyContinuation(request, { terminalResponsePerformed: false }, dependencies);
    const selection = resolveLocalReviewCoverageSelection({ policy, target: input.target, sourceId: "delegated-agent",
      standardReview: input.standardReview, nextPassContext, predecessorOperationId: predecessor.producerId,
      coverageAdmission: input.coverageAdmission });
    if (selection.state !== "ready") return selection;
    const ready = await assertEvidenceBoundReviewExecutionAdmission(request,
      { terminalResponsePerformed: false, coverageSelected: selection.coverageSelected },
      { sourceId: "delegated-agent", nextAction: "local-prepare" }, dependencies);
    return { state: "ready", pass: ready.payload.pass, coverageAdmission: selection.coverageAdmission,
      incrementalBasis: nextPassContext.incremental?.basis };
  };
  return fixture;
}

it.each([false, true])("publishes the admitted delta scope or explicit complete=%s", async explicitComplete => {
  const fixture = await scenario();
  const state = await fixture.moveHead("e", explicitComplete ? { requestedCoverage: "complete" } : undefined);
  expect(state.coverageAdmission).toEqual(explicitComplete ? { requestedCoverage: "complete" } : {
    requestedCoverage: "incremental", correctionScope: { schemaVersion: 1, predecessorProducerId: fixture.original.operationId,
      predecessorHeadSha: fixture.original.target.headSha, basisHeadSha: fixture.original.target.headSha,
      headSha: state.target.headSha, requiredFindings: [] },
  });
  if (!explicitComplete) {
    expect(state.reviewerInstructions).not.toMatch(/closure/iu);
    const replayed = await fixture.prepare();
    expect(replayed.operationId).toBe(state.operationId);
    expect(replayed.coverageAdmission).toEqual(state.coverageAdmission);
  }
});

it("replays a completed delta with its admitted coverage when no new coverage is supplied", async () => {
  const fixture = await scenario();
  const delta = await fixture.moveHead();
  await fixture.conclude(delta, "clean");
  expect(await prepareLocalReview(fixture.input, fixture.dependencies)).toMatchObject({ state: "review-complete",
    payload: { operationId: delta.operationId, target: delta.target } });
  expect(fixture.laneProgress()?.attempts).toHaveLength(2);
});
