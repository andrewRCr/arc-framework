/** Complete successors of verified converged fix checks preserve their grant and coverage boundaries. */
import { expect, it } from "vitest";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const target = { repository: "owner/repo", pullRequest: null, headSha: "a".repeat(40) };
const predecessor = "local-clean-fix-check";
function request(scope: "whole-target" | "chunked") {
  return { schemaVersion: 1, target, lane: "standard", frontlineActive: false,
    sources: ["delegated-agent"], maxPasses: 1, completedPasses: 3,
    standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"b".repeat(64)}`, retrigger: "full-final", count: 1 },
    attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: predecessor, chunkSeriesComplete: true }],
    verifiedTerminalSignal: { reviewOperationId: predecessor, confirmedFindingCount: 0, maxConfirmedSeverity: null,
      materialFix: false, coverageAdequate: false, effectiveCoverage: "incremental" },
    nextPassContext: { completePasses: 2, convergence: "converged", responseDue: false, incremental: null },
    scopeSelection: { mode: scope, target },
    additionalPassAuthorization: { target, lane: "standard", precedingProducerId: predecessor, completedPasses: 3, nextPass: 4 } };
}

it.each(["whole-target", "chunked"] as const)("admits the required complete successor in %s scope without settling final coverage", scope => {
  const input = request(scope);
  expect(resolveReviewPolicy({ ...input, additionalPassAuthorization: undefined }))
    .toMatchObject({ state: "coverage-required", payload: { verifiedTerminalSignal: { coverageAdequate: false } } });
  expect(resolveReviewPolicy(input)).toMatchObject({ state: "ready", nextAction: "local-prepare",
    payload: { pass: 4, scope, ceilingOverrideApplied: true, attemptedSources: [{ reviewOperationId: predecessor }] } });
});


it("admits the complete successor of a fix check that converged with only minor findings", () => {
  const input = request("whole-target");
  const minorOnly = { ...input,
    attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: predecessor, chunkSeriesComplete: true }],
    verifiedTerminalSignal: { ...input.verifiedTerminalSignal, confirmedFindingCount: 1, maxConfirmedSeverity: "minor" } };
  expect(resolveReviewPolicy({ ...minorOnly, additionalPassAuthorization: undefined }))
    .toMatchObject({ state: "coverage-required", payload: { responseRequired: false } });
  expect(resolveReviewPolicy(minorOnly)).toMatchObject({ state: "ready", nextAction: "local-prepare",
    payload: { pass: 4, coverage: "complete", ceilingOverrideApplied: true } });
});

it("does not spend clean fix-check authority on another incremental look", () => {
  const input = request("chunked");
  expect(resolveReviewPolicy({ ...input, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "invalid-override", payload: { reason: "pass-not-converged", consumedPass: false } });
  expect(resolveReviewPolicy({ ...input, chosenCoverage: "complete" }))
    .toMatchObject({ state: "ready", payload: { pass: 4 } });
});

it.each(["pending", "unconverged"] as const)("retains the %s findings response boundary before a complete successor", convergence => {
  const input = request("whole-target");
  expect(resolveReviewPolicy({ ...input,
    attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: predecessor, chunkSeriesComplete: true }],
    verifiedTerminalSignal: { ...input.verifiedTerminalSignal, confirmedFindingCount: 1, maxConfirmedSeverity: "major",
      materialFix: convergence === "unconverged" },
    nextPassContext: { ...input.nextPassContext, convergence, responseDue: true } }))
    .toMatchObject({ state: "invalid-override", payload: { reason: "pass-not-converged", consumedPass: false } });
});

it("does not reinterpret an incomplete local chunk aggregate as a finished predecessor", () => {
  const input = request("chunked");
  expect(() => resolveReviewPolicy({ ...input,
    attempts: [{ ...input.attempts[0], chunkSeriesComplete: false }] }))
    .toThrow("chunked terminal attempt requires one complete aggregate producer");
});

const fresh = { ...request("whole-target"), attempts: [], verifiedTerminalSignal: undefined,
  additionalPassAuthorization: undefined, completedPasses: 2, maxPasses: 3 };
const scope = { schemaVersion: 1, predecessorProducerId: predecessor, predecessorHeadSha: "c".repeat(40),
  basisHeadSha: "c".repeat(40), headSha: target.headSha,
  requiredFindings: [{ producerId: predecessor, findingId: "minor-one", locus: "src/example.ts:7" }] };

it("names the complete look a converged full-final review leaves no choice about", () => {
  expect(resolveReviewPolicy(fresh)).toMatchObject({ state: "ready", nextAction: "local-prepare",
    payload: { pass: 3, coverage: "complete" } });
});

it("names a delta check as incremental unless complete coverage was chosen", () => {
  const delta = { ...fresh, nextPassContext: { ...fresh.nextPassContext, incremental: { basis: "delta-check", scope } } };
  expect(resolveReviewPolicy(delta)).toMatchObject({ state: "ready", payload: { coverage: "incremental" } });
  expect(resolveReviewPolicy({ ...delta, chosenCoverage: "complete" }))
    .toMatchObject({ state: "ready", payload: { coverage: "complete" } });
});

it("leaves the coverage unnamed while preparation still offers the fix-check choice", () => {
  const offered = { ...fresh, standardReview: { ...fresh.standardReview, retrigger: "incremental" },
    nextPassContext: { ...fresh.nextPassContext, convergence: "pending", incremental: { basis: "fix-check", scope } } };
  const ready = resolveReviewPolicy(offered);
  expect(ready).toMatchObject({ state: "ready" });
  if (ready.state !== "ready") throw new Error("expected a ready look");
  expect(ready.payload).not.toHaveProperty("coverage");
  expect(resolveReviewPolicy({ ...offered, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "ready", payload: { coverage: "incremental" } });
});
