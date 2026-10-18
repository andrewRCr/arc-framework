/** Delta-chain coverage and current-head carry are separate discharge authorities. */
import { expect, it } from "vitest";
import { createLocalDeltaFixture, linearReviewRangeProof } from "../../../../fixtures/local-review-delta.js";
import { createReviewTarget, createReviewRequirement } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createHostedAdmission } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { createHostedTerminalAttemptFixture, publishHostedTerminalProgressFixture } from "../../../../fixtures/hosted-review.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { readLaneProgress } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationDischarge } from "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { confirmReviewCorrectionLeg, deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { resolveEvidenceBoundReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { proveReviewDeltaRange } from "../../../../../src/scripts/review-gate/policy/review-delta-range-proof.js";
import { classifyReviewContributionApplicability, MAX_REVIEW_APPLICABILITY_PATHS } from "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import { reduceReviewApplicabilityAuthority, reviewApplicabilityConsumerAction } from "../../../../../src/scripts/review-gate/policy/review-applicability-authority.js";

const dispositionStore = { readDispositionRecord: async () => null,
  appendDispositionRecord: async () => { throw new Error("read-only policy"); } };
const oid = (seed: string) => seed.repeat(40);

async function scenario() {
  const fixture = await createLocalDeltaFixture("Light");
  const root = await fixture.resultReader.readResult(fixture.original.operationId);
  if (root.kind === "frontline" || root.admission.lineage.kind !== "candidate") throw new Error("expected Candidate review");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = root.requirement;
  const standardReview = { obligation, reasons, rubricVersion, rubricDigest, retrigger, count };
  expect(retrigger).toBe("incremental");
  const reservation = createStandardReviewReservation({ candidateId: root.admission.lineage.candidateId,
    sourceId: "delegated-agent", sources: ["delegated-agent"], obligation: standardReview,
    repository: "owner/repository", headSha: root.target.headSha });
  async function terminalPolicy(attempt: { attemptId: string }) {
    const current = await fixture.resultReader.readResult(attempt.attemptId);
    const nextPassContext = await deriveReviewNextPassContext({ predecessor: current, currentTarget: current.target,
      currentLineage: current.admission.lineage, standardReview, dispositionStore,
      resultReader: fixture.resultReader, readResponsePerformance: async () => null });
    return resolveEvidenceBoundReviewPolicy({ schemaVersion: 1, lane: "standard", standardReview,
      target: { repository: "owner/repository", pullRequest: 42, headSha: current.target.headSha },
      completedPasses: current.admission.logicalPass,
      attempts: [{ sourceId: "delegated-agent", outcome: current.originalOutcome, reviewOperationId: current.producerId }],
    }, { sources: ["delegated-agent"], maxPasses: 3, nextPassContext, resultReader: fixture.resultReader,
      dispositionStore, confirmTarget: async () => current.target,
      confirmIncrementalApplicability: (earlier, successor) => confirmReviewCorrectionLeg({ predecessor: earlier,
        currentResult: successor, currentTarget: successor.target, currentLineage: successor.admission.lineage,
        dispositionStore, readResponsePerformance: async () => null,
        rangeProof: linearReviewRangeProof(earlier.target.headSha, successor.target.headSha),
        confirmGrounds: async () => "review-required" }),
    });
  }
  return { ...fixture, root, candidateId: root.admission.lineage.candidateId, reservation, terminalPolicy,
    progress: (headSha: string) => readLaneProgress(fixture.dependencies.operationStore, {
      lane: "standard", repositoryId: root.repositoryId, headSha, lineage: root.admission.lineage }) };
}

function earlierRead(fixture: Awaited<ReturnType<typeof scenario>>, producer: ReviewResult, sameTree: boolean,
  residual: "bounded" | "unbounded" | "missing" = "bounded") {
  const sourceId = producer.kind === "hosted" ? producer.sourceIdentity : "delegated-agent";
  const current = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: producer.repositoryId, baseRef: producer.target.baseRef, diffBaseSha: producer.target.diffBaseSha,
    diffBaseTree: producer.target.diffBaseTree, headSha: oid("f"), headTree: sameTree ? producer.target.headTree : oid("9") });
  const projection = classifyReviewContributionApplicability({ schemaVersion: 1, repositoryId: producer.repositoryId,
    repository: "owner/repository", pullRequest: 42, lane: "standard", sourceId,
    priorAttemptId: producer.producerId, priorHead: producer.target.headSha, currentHead: current.headSha,
    priorBase: producer.target.diffBaseSha, currentBase: current.diffBaseSha,
  }, residual === "missing" ? null : { endpoints: { before: { predecessor: { head: producer.target.diffBaseSha, tree: producer.target.diffBaseTree },
      member: { head: producer.target.headSha, tree: producer.target.headTree } },
    after: { predecessor: { head: current.diffBaseSha, tree: current.diffBaseTree }, member: { head: current.headSha, tree: current.headTree } } },
    proof: sameTree ? { status: "accepted", proof: "mechanical-reapply" }
      : { status: "refused", reason: "contribution-diverged", paths: residual === "unbounded"
        ? Array.from({ length: MAX_REVIEW_APPLICABILITY_PATHS + 1 }, (_, index) => `src/file-${index}.ts`) : ["src/example.ts"] } });
  const authority = reduceReviewApplicabilityAuthority(fixture.candidateId, projection, []);
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const hosted = owner.attempts.find(attempt => attempt.attemptId === producer.producerId)?.hosted;
  return { current, read: { status: "complete" as const, attempts: [{ operationId: owner.operationId,
    attemptId: producer.producerId, logicalPass: producer.admission.logicalPass, updatedAt: owner.updatedAt,
    sourceId, outcome: producer.originalOutcome, requestedCoverage: producer.admission.requestedCoverage,
    effectiveCoverage: producer.admission.effectiveCoverage, scopeMode: producer.admission.scopeMode,
    producerTarget: producer.target, applicability: reviewApplicabilityConsumerAction(authority), projection,
    ...(hosted?.handle === undefined ? {} : { hosted: { ...hosted, handle: hosted.handle } }) }] } };
}

it("keeps a range-only earlier clean review outstanding instead of carrying it", async () => {
  const fixture = await scenario();
  const { current, read } = earlierRead(fixture, fixture.root, false);
  await expect(proveReviewDeltaRange({ predecessor: fixture.root.target, current, convergence: "converged",
    ...linearReviewRangeProof(fixture.root.target.headSha, current.headSha) })).resolves.toBe(true);
  expect(read.attempts[0]?.applicability).toBe("stop");
  expect(await projectHostedReservationDischarge({ reservation: fixture.reservation,
    span: [fixture.root.target.headSha, current.headSha], target: { repository: "owner/repository", pullRequest: 42, headSha: current.headSha },
    readLaneProgress: fixture.progress, readEarlierAttemptApplicability: async () => read,
    requireEarlierApplicabilityEvidence: true, resolveTerminalPolicy: fixture.terminalPolicy,
    resolveEarlierTerminalPolicy: fixture.terminalPolicy,
  })).toMatchObject({ discharged: false, nextSource: null, applicability: { state: "decision-required" } });
});

it("discharges a converged local delta at its own head through the proven coverage chain", async () => {
  const fixture = await scenario();
  const delta = await fixture.moveHead();
  await fixture.conclude(delta, "clean");
  expect(await projectHostedReservationDischarge({ reservation: fixture.reservation,
    span: [fixture.root.target.headSha, delta.target.headSha], target: { repository: "owner/repository", pullRequest: 42, headSha: delta.target.headSha },
    readLaneProgress: fixture.progress, resolveTerminalPolicy: fixture.terminalPolicy,
    resolveEarlierTerminalPolicy: fixture.terminalPolicy,
  })).toMatchObject({ discharged: true, nextSource: null });
});

it.each(["bounded", "unbounded", "missing"] as const)("requests a local delta across a plain commit with residual=%s", async residual => {
  const fixture = await scenario();
  const { current, read } = earlierRead(fixture, fixture.root, false, residual);
  const nextPassContext = await deriveReviewNextPassContext({ predecessor: fixture.root, currentTarget: current,
    currentLineage: fixture.root.admission.lineage, standardReview: fixture.reservation.obligation,
    dispositionStore, resultReader: fixture.resultReader, readResponsePerformance: async () => null,
    rangeProof: linearReviewRangeProof(fixture.root.target.headSha, current.headSha),
    deltaAdmission: { sources: fixture.reservation.sources, surface: "ordinary" },
  });
  expect(nextPassContext.incremental?.basis).toBe("delta-check");
  const discharge = await projectHostedReservationDischarge({ reservation: fixture.reservation, nextPassContext,
    span: [fixture.root.target.headSha, current.headSha], target: { repository: "owner/repository", pullRequest: 42, headSha: current.headSha },
    readLaneProgress: fixture.progress, readEarlierAttemptApplicability: async () => read,
    requireEarlierApplicabilityEvidence: true, resolveTerminalPolicy: fixture.terminalPolicy,
    resolveEarlierTerminalPolicy: fixture.terminalPolicy,
  });
  expect(discharge).toMatchObject({ discharged: false, nextSource: "delegated-agent", requestCoverage: "incremental",
    correctionScope: nextPassContext.incremental?.scope });
  expect(discharge.applicability).toBeUndefined();
});

it("carries a mechanically applicable attempt whose own coverage chain contains a delta leg", async () => {
  const fixture = await scenario();
  const state = await fixture.moveHead();
  await fixture.conclude(state, "clean");
  const delta = await fixture.resultReader.readResult(state.operationId);
  const { current, read } = earlierRead(fixture, delta, true);
  expect(read.attempts[0]?.applicability).toBe("retain-prior-attempt");
  expect(await projectHostedReservationDischarge({ reservation: fixture.reservation,
    span: [fixture.root.target.headSha, delta.target.headSha, current.headSha], target: { repository: "owner/repository", pullRequest: 42, headSha: current.headSha },
    readLaneProgress: fixture.progress, readEarlierAttemptApplicability: async () => read,
    requireEarlierApplicabilityEvidence: true, resolveTerminalPolicy: fixture.terminalPolicy,
    resolveEarlierTerminalPolicy: fixture.terminalPolicy,
  })).toMatchObject({ discharged: true, nextSource: null });
});

it("drops an earlier forced hosted choice before the delta reaches source selection", async () => {
  const fixture = await scenario();
  const root = fixture.root;
  const owner = fixture.laneProgress();
  if (owner?.kind !== "lane-progress") throw new Error("expected lane owner");
  const requirement = createReviewRequirement({ target: root.target, projection: fixture.reservation.obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("expected required review");
  const admission = createHostedAdmission({ schemaVersion: 1, repositoryId: root.repositoryId,
    lineage: root.admission.lineage, logicalPass: 2, sourceId: "codex-pr",
    target: { repository: "owner/repository", pullRequest: 42, headSha: root.target.headSha },
    requestedCoverage: "complete", reviewTarget: root.target, requirement, actorIdentity: "reviewer-1" });
  const terminal = createHostedTerminalAttemptFixture({ admission, outcome: "clean",
    invocation: { mode: "force", sourceId: "codex-pr" } });
  await publishHostedTerminalProgressFixture(fixture.dependencies.operationStore, {
    operationId: owner.operationId, repositoryId: root.repositoryId, lineage: root.admission.lineage,
    logicalPass: 2, changeRequestId: "42", headSha: root.target.headSha, sourceId: "codex-pr", outcome: "clean",
    terminal, now: "2026-10-18T00:02:00Z",
  });
  const producer = await fixture.resultReader.readResult(terminal.attemptId);
  const { current, read } = earlierRead(fixture, producer, false);
  const reservation = createStandardReviewReservation({ candidateId: fixture.candidateId,
    sourceId: "delegated-agent", sources: ["delegated-agent", "codex-pr"], obligation: fixture.reservation.obligation,
    repository: "owner/repository", headSha: root.target.headSha });
  const nextPassContext = await deriveReviewNextPassContext({ predecessor: producer, currentTarget: current,
    currentLineage: producer.admission.lineage, standardReview: reservation.obligation, dispositionStore,
    resultReader: fixture.resultReader, readResponsePerformance: async () => null,
    rangeProof: linearReviewRangeProof(producer.target.headSha, current.headSha),
    deltaAdmission: { sources: reservation.sources, surface: "ordinary" },
  });
  const discharge = await projectHostedReservationDischarge({ reservation, nextPassContext,
    span: [root.target.headSha, current.headSha], target: { repository: "owner/repository", pullRequest: 42, headSha: current.headSha },
    readLaneProgress: fixture.progress, readEarlierAttemptApplicability: async sourceId => sourceId === "codex-pr"
      ? read : earlierRead(fixture, root, false).read,
    requireEarlierApplicabilityEvidence: true, resolveTerminalPolicy: fixture.terminalPolicy,
    resolveEarlierTerminalPolicy: fixture.terminalPolicy,
  });
  expect(discharge).toMatchObject({ discharged: false, nextSource: "delegated-agent", requestCoverage: "incremental" });
  expect(discharge.invocation).toBeUndefined();
  expect(resolveReviewPolicy({ schemaVersion: 1, lane: "standard", standardReview: reservation.obligation,
    target: { repository: "owner/repository", pullRequest: 42, headSha: current.headSha },
    sources: reservation.sources, maxPasses: 4, nextPassContext, completedPasses: 2, attempts: [],
    ...(discharge.invocation === undefined ? {} : { invocation: discharge.invocation }),
  })).toMatchObject({ state: "ready", nextAction: "local-prepare", payload: { sourceId: "delegated-agent" } });
});
