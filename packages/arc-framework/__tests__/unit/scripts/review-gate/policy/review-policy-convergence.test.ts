/** Complete coverage and response-aware continuation under final-head review. */
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { approvedRecord, cleanHostedResult, findingsHostedResult, performedFix } from "../../../../fixtures/review-response-proof.js";
import { createReviewRequirement, createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewResult } from "../../../../../src/scripts/review-gate/core/review-result.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { resolveEvidenceBoundReviewPolicy, resolveEvidenceBoundReviewPolicyContinuation } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";

async function fixture(input: { severity?: "major" | "minor"; performed?: boolean;
  coverage?: "complete" | "incremental"; retrigger?: "full-final" | "incremental" } = {}) {
  const root = cleanHostedResult();
  const initial = input.severity === undefined ? cleanHostedResult() : findingsHostedResult([input.severity]);
  if (root.kind !== "hosted" || initial.kind !== "hosted") throw new Error("expected hosted producer");
  const standardReview = { obligation: initial.requirement.obligation, reasons: initial.requirement.reasons,
    rubricVersion: initial.requirement.rubricVersion, rubricDigest: initial.requirement.rubricDigest,
    retrigger: input.retrigger ?? "full-final", count: initial.requirement.count };
  const { targetId: ignored, ...coordinates } = initial.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  const requirement = createReviewRequirement({ target, projection: standardReview,
    acceptableSources: initial.requirement.acceptableSources, initialAdmission: initial.requirement.initialAdmission });
  if (requirement === null) throw new Error("expected requirement");
  const coverage = input.coverage ?? "incremental";
  const result: Extract<ReviewResult, { kind: "hosted" }> = { ...initial, producerId: "hosted/current", target, requirement,
    resultDigest: canonicalDigest({ result: "current", severity: input.severity ?? null }),
    hostedTarget: { ...initial.hostedTarget, headSha: target.headSha },
    admission: { ...initial.admission, logicalPass: 2, requestedCoverage: coverage, effectiveCoverage: coverage,
      lineage: initial.admission.lineage.kind === "head-bound"
        ? { ...initial.admission.lineage, headSha: target.headSha } : initial.admission.lineage, policyVersion: requirement.policyVersion,
      ...(coverage === "incremental" ? { correctionScope: { schemaVersion: 1 as const,
        predecessorProducerId: root.producerId, predecessorHeadSha: root.target.headSha,
        basisHeadSha: root.target.headSha, headSha: target.headSha, requiredFindings: [] } } : {}) } };
  const record = input.severity === undefined ? null : approvedRecord(result, [{
    sourceVerification: "verified", verifiedSeverity: input.severity, disposition: "fix",
  }]);
  const evidence = { resultReader: { readResult: async (id: string) => id === root.producerId ? root : result },
    dispositionStore: { readDispositionRecord: async () => record,
      appendDispositionRecord: async () => { throw new Error("read-only"); } },
    readResponsePerformance: async () => record === null || input.performed !== true ? null
      : { ...performedFix(result, record), producedHeadSha: "9".repeat(40) },
    confirmIncrementalApplicability: async () => "applicable" as const,
  };
  const nextPassContext = await deriveReviewNextPassContext({ completedPasses: 2, completePasses: coverage === "complete" ? 2 : 1, predecessor: result, currentTarget: target,
    currentLineage: result.admission.lineage, standardReview, ...evidence });
  const request = { schemaVersion: 1, target: result.hostedTarget, lane: "standard", standardReview,
    completedPasses: 2, attempts: [{ sourceId: result.sourceIdentity, outcome: result.originalOutcome,
      reviewOperationId: result.producerId }] };
  const dependencies = { ...evidence, nextPassContext, sources: ["codex-pr", "delegated-agent"], maxPasses: 4,
    confirmTarget: async () => target };
  return { result, request, dependencies };
}

describe("final-head convergence", () => {
  it("keeps a clean fix check open until a complete pass runs", async () => {
    const { request, dependencies } = await fixture();
    await expect(resolveEvidenceBoundReviewPolicy(request, dependencies)).resolves.toMatchObject({
      state: "coverage-required", payload: { responseRequired: false, verifiedTerminalSignal: { coverageAdequate: false } },
    });
  });

  it("admits the complete successor after a clean fix check without a coverage choice", async () => {
    const { request, dependencies } = await fixture();
    await expect(resolveEvidenceBoundReviewPolicyContinuation(request, { terminalResponsePerformed: false }, dependencies))
      .resolves.toMatchObject({ state: "ready", nextAction: "hosted-request", payload: { pass: 3, sourceId: "codex-pr" } });
  });

  it.each([false, true])("reports a material fix check's response due while performed=%s", async performed => {
    const { request, dependencies } = await fixture({ severity: "major", performed });
    await expect(resolveEvidenceBoundReviewPolicyContinuation(request, { terminalResponsePerformed: performed }, dependencies))
      .resolves.toMatchObject({ state: "coverage-required", payload: { responseRequired: !performed } });
    if (performed) await expect(resolveEvidenceBoundReviewPolicyContinuation(request,
      { terminalResponsePerformed: true, coverageSelected: true }, dependencies)).resolves.toMatchObject({ state: "ready" });
  });

  it.each([false, true])("waits for a minor fix check response before its successor while performed=%s", async performed => {
    const { request, dependencies } = await fixture({ severity: "minor", performed });
    const resolution = await resolveEvidenceBoundReviewPolicyContinuation(request, { terminalResponsePerformed: performed }, dependencies);
    expect(resolution).toMatchObject(performed ? { state: "ready", payload: { pass: 3 } }
      : { state: "coverage-required", payload: { responseRequired: true } });
  });

  it.each([undefined, "minor"] as const)("closes on complete coverage with %s findings", async severity => {
    const { request, dependencies } = await fixture({ coverage: "complete", severity, performed: true });
    await expect(resolveEvidenceBoundReviewPolicy(request, dependencies)).resolves.toMatchObject({ state: "pass-complete" });
  });

  it("retains incremental policy's adequate-chain convergence", async () => {
    const { request, dependencies } = await fixture({ retrigger: "incremental" });
    // Both chain links retain the same policy in the in-flight review lineage.
    const root = await dependencies.resultReader.readResult("hosted/attempt-1");
    if (root.kind !== "hosted") throw new Error("expected hosted root");
    const requirement = createReviewRequirement({ target: root.target, projection: request.standardReview,
      acceptableSources: root.requirement.acceptableSources, initialAdmission: root.requirement.initialAdmission });
    if (requirement === null) throw new Error("expected requirement");
    const read = dependencies.resultReader.readResult;
    dependencies.resultReader.readResult = async id => id === root.producerId ? {
      ...root, requirement, admission: { ...root.admission, policyVersion: requirement.policyVersion },
    } : read(id);
    await expect(resolveEvidenceBoundReviewPolicy(request, dependencies)).resolves.toMatchObject({ state: "pass-complete" });
  });

  it("refuses elective-pass authority over a fix check that has not closed the lane", async () => {
    const { request, dependencies, result } = await fixture();
    await expect(resolveEvidenceBoundReviewPolicy({ ...request, additionalPassAuthorization: {
      target: request.target, lane: "standard", precedingProducerId: result.producerId, completedPasses: 2, nextPass: 3,
    } }, dependencies)).resolves.toMatchObject({ state: "invalid-override", payload: { reason: "pass-not-converged" } });
  });
});
