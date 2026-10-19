import { describe, expect, it } from "vitest";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeResultDigest, reviewOutcomeDispositionContext } from
  "../../../../../../../src/lib/store/kinds/review/outcome/result.js";
import { dispositionSourceContextForResult } from
  "../../../../../../../src/scripts/review-gate/core/review-result-disposition.js";
import { createLocalContinuationFixture } from "../../../../../../fixtures/local-review-continuation.js";
import { createFrontlineFixture } from "../../../../../../fixtures/frontline-review.js";
import { frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";

describe("portable result identities", () => {
  it("reproduces the production local reader's digest and approval context from stored facts alone", async () => {
    const fixture = await createLocalContinuationFixture();
    const state = fixture.original;
    const receipt = await fixture.conclude(state, "findings");
    const result = await fixture.resultReader.readResult(state.operationId);
    const attempt = fixture.laneProgress()?.attempts.find(({ attemptId }) => attemptId === state.operationId);
    if (attempt?.local === undefined) throw new Error("expected local lane attempt");
    const outcome = ReviewOutcomeSchema.parse({ schemaVersion: 1, attemptId: state.operationId,
      lane: "standard", lineage: state.lineage, logicalPass: state.logicalPass, retryGeneration: state.retryGeneration,
      source: { kind: "local", sourceId: state.laneSourceId }, target: state.target, requirement: state.requirement,
      requestedCoverage: attempt.local.requestedCoverage, effectiveCoverage: attempt.local.effectiveCoverage,
      outcome: "findings", findings: receipt.findings, endedAt: "2026-10-19T13:00:00Z",
      local: { ...attempt.local, request: state.request, attestation: state.attestation,
        policyVersion: state.policyVersion, policyBindingDigest: state.policyBindingDigest,
        attestationRuntimeKind: state.attestationRuntimeKind, sourceDigest: state.sourceDigest,
        guidanceDigest: state.guidanceDigest, receipt } });
    expect(reviewOutcomeResultDigest(outcome)).toBe(result.resultDigest);
    expect(reviewOutcomeDispositionContext(outcome)).toEqual(dispositionSourceContextForResult(result));
  });

  it("returns the frontline producer's original digest and approval context", async () => {
    const fixture = createFrontlineFixture();
    const result = await fixture.reader.readResult(fixture.admission.operationId);
    const outcome = ReviewOutcomeSchema.parse(frontlineOutcome());
    expect(reviewOutcomeResultDigest(outcome)).toBe(result.resultDigest);
    expect(reviewOutcomeDispositionContext(outcome)).toEqual(dispositionSourceContextForResult(result));
  });
});
