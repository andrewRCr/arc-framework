/** Published singleton status names ordinary local prepare without a delivery selector. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { resolveReviewPolicy } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { LocalPrepareRequestSchema } from "../../../../src/scripts/review-gate/runtime/local-prepare.js";
import { composeSingletonReviewObligation, resolveReviewStatus } from "../../../../src/scripts/review-gate/status.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";

const candidateId = canonicalDigest({ candidate: 1 });
const handle = createHostedHandleFixture({ provider: "codex-pr", lineage: { kind: "candidate", candidateId } });
const target = { repository: handle.target.repository, headRef: "feat/example", headSha: handle.target.headSha };
const requirement = handle.admission.requirement;
const standardReview = { obligation: requirement.obligation, reasons: requirement.reasons,
  rubricVersion: requirement.rubricVersion, rubricDigest: requirement.rubricDigest,
  retrigger: requirement.retrigger, count: requirement.count };
function localObligation(includeObligation = true, authority?: "ceiling" | "additional") {
  const atCeiling = authority === "ceiling";
  const elective = authority === "additional";
  const producerId = "prior-hosted-review";
  const invocation = elective ? { mode: "force" as const, sourceId: "delegated-agent" } : undefined;
  const additionalPassAuthorization = elective ? { target: handle.target, lane: "standard" as const,
    precedingProducerId: producerId, completedPasses: 1, nextPass: 2 } : undefined;
  const ceilingOverride = atCeiling ? { target: handle.target, lane: "standard" as const, exhaustedPassCount: 1, nextPass: 2 } : undefined;
  const admission = resolveReviewPolicy({ schemaVersion: 1, target: handle.target, lane: "standard", standardReview,
    sources: ["codex-pr", "delegated-agent"], maxPasses: atCeiling ? 1 : 4, completedPasses: 1,
    attempts: elective ? [{ sourceId: "codex-pr", outcome: "clean", reviewOperationId: producerId }] : [],
    ...(invocation === undefined ? {} : { invocation }),
    ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization,
      verifiedTerminalSignal: { reviewOperationId: producerId, confirmedFindingCount: 0, maxConfirmedSeverity: null,
        materialFix: false, coverageAdequate: true } }),
    ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
    nextPassContext: { convergence: elective ? "converged" : "unconverged", responseDue: false, incremental: null } });
  expect(admission).toMatchObject({ state: "ready", nextAction: "local-prepare" });
  return composeSingletonReviewObligation({
    discharge: { discharged: false, detail: "The material fix needs local review." },
    applicabilityContext: { workUnitId: "example", candidateId, expectedRecordVersion: canonicalDigest({ version: 1 }) },
    request: { target: handle.target, admission, sourceId: "delegated-agent", coverage: "complete",
      ...(includeObligation ? { standardReview } : {}), ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
      ...(invocation === undefined ? {} : { invocation }),
      ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }) },
  });
}

it("refuses a singleton local action missing its reserved obligation", () => {
  expect(localObligation(false)).toMatchObject({ state: "blocked",
    detail: expect.stringContaining("reserved obligation") });
});

it("names ordinary local prepare after a published hosted material fix", async () => {
  const routedObligation = localObligation();
  const result = await resolveReviewStatus({ target }, { observe: async () => ({ actualHeadSha: target.headSha,
    currentBaseOid: "b".repeat(40), baseContained: true, requiredChecks: "green", routedObligation }) });
  expect(result).toMatchObject({ state: "review-required", nextAction: "review-singleton-local-prepare", action: {
    schemaVersion: 1, sourceId: "delegated-agent", target: handle.target,
    lineageBoundary: { workUnitId: "example", candidateId }, standardReview, request: { schemaVersion: 1 },
  } });
  if (result.nextAction !== "review-singleton-local-prepare") throw new Error("expected ordinary singleton local prepare");
  const request = LocalPrepareRequestSchema.parse({ ...result.action.request, evaluatorIdentity: "independent-reviewer",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" } });
  expect(request).not.toHaveProperty("deliveryAdmission");
  expect(request).not.toHaveProperty("memberHeadObjectId");
});

it("preserves approved ceiling authority for the ordinary local-prepare consumer", () => {
  const obligation = localObligation(true, "ceiling");
  if (!("singletonLocalAction" in obligation)) throw new Error("expected singleton local prepare");
  const request = LocalPrepareRequestSchema.parse({ ...obligation.singletonLocalAction.request,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } });
  expect(request.policyJudgment?.ceilingOverride).toEqual({ exhaustedPassCount: 1, nextPass: 2 });
});

it("preserves an additional-pass decision and its selected local source", () => {
  const obligation = localObligation(true, "additional");
  if (!("singletonLocalAction" in obligation)) throw new Error("expected singleton local prepare");
  const request = LocalPrepareRequestSchema.parse({ ...obligation.singletonLocalAction.request,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } });
  expect(request.policyJudgment).toMatchObject({ invocation: { mode: "force", sourceId: "delegated-agent" },
    additionalPassAuthorization: { headSha: target.headSha, precedingProducerId: "prior-hosted-review",
      completedPasses: 1, nextPass: 2 } });
});
