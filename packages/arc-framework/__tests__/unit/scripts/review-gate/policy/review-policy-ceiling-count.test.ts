/** Complete-pass ceilings retain logical attempt bindings across fix checks. */
import { describe, expect, it } from "vitest";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";

const target = { repository: "arc/example", pullRequest: 42, headSha: "a".repeat(40) };
const base = {
  schemaVersion: 1, target, lane: "standard", sources: ["delegated-agent"],
  standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1", rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`),
    retrigger: "full-final", count: 1 },
  completedPasses: 5, maxPasses: 3, attempts: [],
  nextPassContext: { completePasses: 2, convergence: "none", responseDue: false, incremental: null },
};

describe("complete-pass ceiling", () => {
  it.each([true, false])("reports the local-source refusal before ceiling approval, configured=%s", configured => {
    const request = { ...base, maxPasses: 2, chosenCoverage: "complete",
      sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"],
      invocation: { mode: "force", sourceId: "codex-pr" },
      nextPassContext: { ...base.nextPassContext, convergence: "unconverged" },
    };
    expect(resolveReviewPolicy(request)).toMatchObject({ state: "unavailable", diagnostics: [{
      code: configured ? "material-fix-local-review-required" : "material-fix-local-source-unconfigured",
    }] });
    const repaired = { ...request, sources: ["codex-pr", "delegated-agent"],
      invocation: { mode: "force", sourceId: "delegated-agent" } };
    expect(resolveReviewPolicy(repaired)).toMatchObject({ state: "approval-required" });
    expect(resolveReviewPolicy({ ...repaired,
      ceilingOverride: { target, lane: "standard", exhaustedPassCount: 5, nextPass: 6 },
    })).toMatchObject({ state: "ready", payload: { sourceId: "delegated-agent", ceilingOverrideApplied: true } });
  });

  it("admits attempt six after two complete looks and three fix checks below the ceiling", () => {
    expect(resolveReviewPolicy(base)).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: false } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2 })).toMatchObject({ state: "approval-required",
      payload: { consequence: { exhaustedPassCount: 5, nextPass: 6 } } });
  });

  it("binds an override by logical attempt while comparing its complete count", () => {
    const ceilingOverride = { target, lane: "standard", exhaustedPassCount: 5, nextPass: 6 };
    expect(resolveReviewPolicy({ ...base, ceilingOverride })).toMatchObject({ state: "invalid-override",
      payload: { reason: "ceiling-not-exhausted" } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2, ceilingOverride })).toMatchObject({ state: "ready",
      payload: { pass: 6, ceilingOverrideApplied: true } });
    expect(resolveReviewPolicy({ ...base, maxPasses: 2,
      ceilingOverride: { ...ceilingOverride, exhaustedPassCount: 2, nextPass: 3 } })).toMatchObject({
      state: "invalid-override", payload: { reason: "pass-count-mismatch" } });
  });
  it("does not subtract an adequate fix-check terminal from the override's complete base", () => {
    expect(resolveReviewPolicy({ ...base, maxPasses: 2,
      standardReview: { ...base.standardReview, retrigger: "incremental" },
      terminalResponseSettled: true,
      attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: "local/fix-check" }],
      nextPassContext: { ...base.nextPassContext, convergence: "unconverged" },
      verifiedTerminalSignal: { reviewOperationId: "local/fix-check", confirmedFindingCount: 1,
        maxConfirmedSeverity: "major", materialFix: true, effectiveCoverage: "incremental", coverageAdequate: true },
      ceilingOverride: { target, lane: "standard", exhaustedPassCount: 4, nextPass: 5 },
    })).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
  });

});

const fixCheck = { ...base, maxPasses: 2, nextPassContext: {
  completePasses: 2, convergence: "unconverged", responseDue: false,
  incremental: { basis: "fix-check", scope: { schemaVersion: 1,
    predecessorProducerId: "local/material-five", predecessorHeadSha: "b".repeat(40),
    basisHeadSha: "b".repeat(40), headSha: target.headSha,
    requiredFindings: [{ producerId: "local/material-five", findingId: "material-one", locus: "src/example.ts:7" }],
  } },
} };
const override = { target, lane: "standard", exhaustedPassCount: 5, nextPass: 6 };

describe("coverage-selected ceiling admission", () => {
  it("leaves incremental coverage ready at the ceiling and gates a chosen complete pass", () => {
    expect(resolveReviewPolicy(fixCheck)).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: false } });
    expect(resolveReviewPolicy({ ...fixCheck, chosenCoverage: "incremental" })).toMatchObject({ state: "ready",
      payload: { pass: 6, ceilingOverrideApplied: false } });
    expect(resolveReviewPolicy({ ...fixCheck, chosenCoverage: "complete" })).toMatchObject({ state: "approval-required",
      payload: { consequence: { exhaustedPassCount: 5, nextPass: 6 } } });
    expect(resolveReviewPolicy({ ...fixCheck, chosenCoverage: "complete", ceilingOverride: override }))
      .toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
  });

  it("leaves an override unapplied until complete coverage is chosen and refuses it beside incremental coverage", () => {
    expect(resolveReviewPolicy({ ...fixCheck, ceilingOverride: override })).toMatchObject({ state: "ready",
      payload: { ceilingOverrideApplied: false } });
    expect(resolveReviewPolicy({ ...fixCheck, chosenCoverage: "incremental", ceilingOverride: override }))
      .toMatchObject({ state: "invalid-override", diagnostics: [{ code: "ceiling-override-incremental-coverage" }],
        payload: { reason: "incremental-coverage" } });
  });

  it("admits a chosen complete pass on exact additional-pass authority", () => {
    expect(resolveReviewPolicy({ ...base, maxPasses: 2, chosenCoverage: "complete",
      nextPassContext: { ...base.nextPassContext, convergence: "converged" },
      attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: "local/final-five" }],
      verifiedTerminalSignal: { reviewOperationId: "local/final-five", confirmedFindingCount: 0,
        maxConfirmedSeverity: null, materialFix: false, effectiveCoverage: "complete", coverageAdequate: true },
      additionalPassAuthorization: { target, lane: "standard", precedingProducerId: "local/final-five", completedPasses: 5, nextPass: 6 },
    })).toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
  });
});
