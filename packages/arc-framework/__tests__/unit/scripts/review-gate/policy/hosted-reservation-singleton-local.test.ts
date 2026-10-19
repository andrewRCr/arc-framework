/** Ordinary Candidate local passes remain discoverable across head and PR creation. */
import { expect, it } from "vitest";
import { createLocalContinuationFixture } from "../../../../fixtures/local-review-continuation.js";
import { assertCandidateHostedReservationPolicyAdmission } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-admission.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { queryEarlierReviewAttempts } from "../../../../../src/scripts/review-gate/policy/earlier-review-attempts.js";

it("discovers a Candidate local result without a PR coordinate in its lane record", async () => {
  const local = await createLocalContinuationFixture();
  await local.conclude(local.original, "clean");
  const result = await queryEarlierReviewAttempts({ schemaVersion: 1, repositoryId: local.original.repositoryId,
    repository: "owner/repository", pullRequest: 42, currentHead: "d".repeat(40), lane: "standard",
    sourceId: "delegated-agent", lineage: local.original.lineage },
  { status: "complete", records: [...local.operations.values()] });
  expect(result).toMatchObject({ status: "complete", candidates: [{ sourceKind: "local",
    attemptId: local.original.operationId, priorHead: local.original.target.headSha,
    target: { repository: "owner/repository", pullRequest: 42, headSha: local.original.target.headSha },
    reviewTarget: local.original.target }] });
});

it("holds hosted capacity while an ordinary Candidate local attempt is pending", async () => {
  const local = await createLocalContinuationFixture();
  const state = local.original;
  if (state.lineage.kind !== "candidate") throw new Error("expected Candidate lineage");
  const reservation = createStandardReviewReservation({ candidateId: state.lineage.candidateId,
    sourceId: "codex-pr", sources: ["codex-pr", "delegated-agent"], repository: "owner/repository", headSha: state.target.headSha,
    obligation: { obligation: state.requirement.obligation, reasons: state.requirement.reasons,
      rubricVersion: state.requirement.rubricVersion, rubricDigest: state.requirement.rubricDigest,
      retrigger: state.requirement.retrigger, count: state.requirement.count } });
  const progress = local.laneProgress();
  if (progress === null) throw new Error("expected pending local lane progress");
  expect(() => assertCandidateHostedReservationPolicyAdmission({ reservation, progress,
    discharge: { discharged: false, detail: "The lane requires review.", nextSource: "codex-pr" },
    nextPassContext: { completePasses: 0, convergence: "none", responseDue: false, incremental: null },
    target: { repository: "owner/repository", pullRequest: 42, headSha: state.target.headSha },
    provider: "codex-pr", coverage: "complete", maxPasses: 4, logicalPass: 1,
  })).toThrow(/capacity.*pending/u);
});
