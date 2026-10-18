/** Local delta admission adopts resolved coverage before publishing and replaying it. */
import { createLocalContinuationFixture } from "./local-review-continuation.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";
import { deriveReviewNextPassContext } from "../../src/scripts/review-gate/policy/review-next-pass.js";
import { resolveLocalReviewCoverageSelection } from "../../src/scripts/review-gate/policy/local-review-coverage-selection.js";
import { assertEvidenceBoundReviewExecutionAdmission, resolveEvidenceBoundReviewPolicyContinuation } from "../../src/scripts/review-gate/policy/review-policy-evidence.js";
import type { LocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare.js";

export function linearReviewRangeProof(before: string, after: string) {
  return { cwd: "/checkout", exec: scriptGitExec([
    { match: ["rev-parse", "--verify", `${before}^{commit}`], responses: [{ stdout: before }] },
    { match: ["rev-parse", "--verify", `${after}^{commit}`], responses: [{ stdout: after }] },
    { match: ["merge-base", "--is-ancestor", before, after], responses: [{ stdout: "" }] },
    { match: ["rev-list", "--first-parent", "--merges", "--parents", `${before}..${after}`], responses: [{ stdout: "" }] },
  ]).exec };
}

export async function createLocalDeltaFixture(workClass: "Light" | "Heavy" = "Heavy") {
  const fixture = await createLocalContinuationFixture("whole-target", workClass);
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
      rangeProof: linearReviewRangeProof(before, after),
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
