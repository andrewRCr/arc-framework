/** Pre-publication continuation over complete passes and local fix checks. */
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewReceipt, createReviewRequest, createReviewRequirement, createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { LocalReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import type { LanePolicyAttempt, LaneProgressProjection } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { composePrePublicationReviewRequest, type PrePublicationCompositionDependencies } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { projectPrePublicationReview } from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { projectStandardReviewObligation } from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { approvedRecord } from "../../../../fixtures/review-response-proof.js";

const digest = (value: string) => canonicalDigest({ value });
const candidateId = digest("candidate");
const assurance = { workContext: "work-unit", workClass: "Heavy" } as const;
const activity = { selfReview: true, frontlineReview: false };
const changeSet = { changeSetState: "known", contentKind: "code-bearing", reviewRisk: "sensitive",
  changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } as const;
const projection = projectStandardReviewObligation(resolveReviewRouting({
  ...changeSet, schemaVersion: 1, assurance, activity,
}).decision);

function targetAt(character: string) {
  return createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
    headSha: character.repeat(40), headTree: character.repeat(40) });
}

function resultAt(target: ReturnType<typeof targetAt>, logicalPass: number,
  predecessor?: LocalReviewResult, severity?: "major" | "minor"): LocalReviewResult {
  const requirement = createReviewRequirement({ target, projection,
    acceptableSources: [{ sourceKind: "agent", qualifier: projection.rubricVersion }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("expected required review");
  const request = createReviewRequest(target, { schemaVersion: 2, semanticsVersion: "review-gate/v2",
    repositoryId: target.repositoryId, targetId: target.targetId, requirementId: requirement.requirementId,
    carrier: { kind: "local-change-set", adapterId: "delegated-agent", changeRequestId: null },
    authorIdentity: "andrew", evaluatorIdentity: "reviewer", lineageId: candidateId, logicalPass, generation: 0,
    requestMechanism: "subagent" });
  const findings = severity === undefined ? [] : [{ findingId: "finding-1", severity, locus: "src/change.ts:1",
    evidenceUrlOrId: `local:${logicalPass}`, sourceOrdinal: 1 }];
  const receipt = createReviewReceipt({ target, requirement, request, applicabilityId: null,
    reviewRunId: `run-${logicalPass}`, evaluatorIdentity: "reviewer", attestingRuntimeIdentity: "arc-cli/0.1.0",
    attestationMechanism: "local-attestation", providerEventIdentity: null,
    result: findings.length === 0 ? "clean" : "findings", findings });
  const coverage = predecessor === undefined ? "complete" : "incremental";
  return { kind: "attested-local", producerId: `local-${logicalPass}`, repositoryId: target.repositoryId,
    target, sourceIdentity: "delegated-agent", originalOutcome: findings.length === 0 ? "clean" : "findings", findings,
    resultDigest: canonicalDigest(receipt), vehicle: { kind: "work-unit", identity: "example" },
    receiptRef: `receipts/${logicalPass}`, localSourceRef: `sources/${logicalPass}`, request, requirement,
    admission: { lineage: { kind: "candidate", candidateId }, logicalPass, retryGeneration: 0,
      requestedCoverage: coverage, effectiveCoverage: coverage, scopeMode: "whole-target",
      policyVersion: requirement.policyVersion, ...(predecessor === undefined ? {} : { correctionScope: {
        schemaVersion: 1, predecessorProducerId: predecessor.producerId, predecessorHeadSha: predecessor.target.headSha,
        basisHeadSha: predecessor.target.headSha, headSha: target.headSha,
        requiredFindings: predecessor.findings.map(({ findingId, locus }) => ({ producerId: predecessor.producerId, findingId, locus })),
      } }) } };
}

function cadenceFixture(sources: string[], severity?: "major" | "minor") {
  const predecessor = resultAt(targetAt("c"), 1, undefined, "major");
  const terminal = resultAt(targetAt("d"), 2, predecessor, severity);
  const records = new Map([predecessor, terminal].filter(result => result.findings.length > 0).map(result =>
    [result.producerId, approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: result.findings[0]?.severity ?? "major", disposition: "fix" }])]));
  let performed = false;
  const performance = (result: LocalReviewResult) => {
    const record = records.get(result.producerId);
    if (record === undefined || (result === terminal && !performed)) return null;
    return { schemaVersion: 1 as const, producerId: result.producerId, dispositionSetId: record.currentDispositionSetId,
      originatingHeadSha: result.target.headSha, producedHeadSha: result === predecessor ? terminal.target.headSha : targetAt("e").headSha,
      performedAt: "2026-10-18T00:00:00Z" };
  };
  const attempt = (): LanePolicyAttempt => ({ attemptId: terminal.producerId, logicalPass: 2,
    sourceId: "delegated-agent", outcome: severity === undefined ? "clean" : performed ? "settled-findings" : "findings",
    ...(performed ? { responsePerformance: performance(terminal) ?? undefined } : {}) });
  const exactTarget = () => performed && severity !== undefined ? targetAt("e") : terminal.target;
  const dependencies: PrePublicationCompositionDependencies = {
    readCandidate: async () => ({ status: "current", candidateId, headSha: exactTarget().headSha,
      subjectDigest: digest("subject"), implementationChanged: false, convergenceVerification: "satisfied",
      convergenceScope: null, lineageHeadShas: [predecessor.target.headSha, terminal.target.headSha, exactTarget().headSha] }),
    readAssurance: async () => ({ status: "resolved", assurance, activity }),
    resolveTarget: async () => ({ status: "resolved", target: { repository: "local/repo-1", pullRequest: null, headSha: exactTarget().headSha } }),
    readReservationTarget: async (_workUnit, target) => ({ status: "resolved", target: { kind: "pinned-head", ...target } }),
    readDeliveryReviewTargets: async () => ({ status: "absent" }),
    deriveImmutableTarget: async () => ({ status: "resolved", target: exactTarget() }),
    readOwnerTerminusAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
    readLanePolicy: async lane => ({ sources: lane === "standard" ? sources : [], maxPasses: 4 }),
    readLaneProgress: async (lane): Promise<LaneProgressProjection> => lane === "frontline"
      ? { status: "recorded", completedPasses: 0, completePasses: 0, attempts: [] }
      : { status: "recorded", completedPasses: 2, completePasses: 1,
        attempts: performed && severity !== undefined ? [] : [attempt()],
        ...(performed && severity !== undefined ? { historicalAttempt: { ...attempt(), headSha: terminal.target.headSha } } : {}) },
    resultReader: { readResult: async id => { const result = [predecessor, terminal].find(result => result.producerId === id);
      if (result === undefined) throw new Error("missing producer"); return result; } },
    dispositionStore: { readDispositionRecord: async id => records.get(id) ?? null,
      appendDispositionRecord: async () => { throw new Error("unexpected write"); } },
    readResponsePerformance: async result => {
      if (result.kind !== "attested-local") throw new Error("expected local producer");
      return performance(result);
    },
    confirmIncrementalApplicability: async () => "applicable", confirmPriorProducerApplicability: async () => "applicable",
  };
  const compose = () => composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", changeSet }, dependencies);
  const resolve = async () => {
    const composition = await compose();
    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") throw new Error(composition.reason);
    return { policy: resolveReviewPolicy(composition.request.standard), procedure: projectPrePublicationReview(composition.request, { reviewedHead: exactTarget().headSha,
      nextAction: { kind: "continue-pre-publication-review", command: "arc review pre-publication example", interactionText: "Continue review." },
      projectionDisposition: "keep-staged-until-publication" }) };
  };
  return { resolve, perform: () => { performed = true; } };
}

describe("pre-publication complete successor", () => {
  it.each([
    { sources: ["codex-pr", "delegated-agent"], state: "awaiting-change-request", nextAction: "open-change-request" },
    { sources: ["delegated-agent", "codex-pr"], state: "ready", nextAction: "local-prepare" },
  ])("advances a clean fix check by configured rank $sources", async ({ sources, state, nextAction }) => {
    const fixture = cadenceFixture(sources);
    await expect(fixture.resolve()).resolves.toMatchObject({ policy: { state, nextAction } });
  });

  it("responds to a converged fix check's minor fixes before admitting complete review", async () => {
    const fixture = cadenceFixture(["delegated-agent", "codex-pr"], "minor");
    await expect(fixture.resolve()).resolves.toMatchObject({
      policy: { state: "coverage-required", payload: { responseRequired: true } },
      procedure: { locus: "candidate-fix-pending", nextAction: { command: "arc review respond -" } },
    });
    fixture.perform();
    await expect(fixture.resolve()).resolves.toMatchObject({
      policy: { state: "ready", nextAction: "local-prepare", payload: { pass: 3 } },
      procedure: { locus: "candidate-review-pending" },
    });
  });

  it("keeps an unconverged fix check at coverage-required with its response due", async () => {
    const fixture = cadenceFixture(["delegated-agent", "codex-pr"], "major");
    await expect(fixture.resolve()).resolves.toMatchObject({
      policy: { state: "coverage-required", payload: { responseRequired: true } },
      procedure: { locus: "candidate-fix-pending", nextAction: { command: "arc review respond -" } },
    });
    fixture.perform();
    await expect(fixture.resolve()).resolves.toMatchObject({
      policy: { state: "coverage-required", payload: { responseRequired: false } },
      procedure: { locus: "candidate-review-pending" },
    });
  });
});
