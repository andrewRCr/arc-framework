/** Source selection after the preceding look approves a material repair. */
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

function request(convergence: "converged" | "unconverged" = "unconverged", pullRequest: number | null = 42) {
  return { schemaVersion: 1, target: { repository: "owner/repo", pullRequest, headSha: "a".repeat(40) },
    lane: "standard", standardReview: { obligation: "required", reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1", rubricDigest: canonicalDigest({ rubric: "standard" }), retrigger: "full-final", count: 1 },
    sources: ["codex-pr", "delegated-agent"], maxPasses: 4, completedPasses: 1, attempts: [],
    nextPassContext: { convergence, responseDue: false, incremental: null } };
}

describe("local review after material fixes", () => {
  it.each([null, 42])("selects the local pass with pull request %s and reserves no hosted source", pullRequest => {
    expect(resolveReviewPolicy(request("unconverged", pullRequest))).toMatchObject({ state: "ready",
      nextAction: "local-prepare", payload: { sourceId: "delegated-agent", pass: 2 } });
  });
  it("takes the configured hosted rank again after convergence", () => {
    expect(resolveReviewPolicy(request("converged"))).toMatchObject({ state: "ready", nextAction: "hosted-request",
      payload: { sourceId: "codex-pr" } });
  });
  it("refuses a forced hosted pass after a material repair", () => {
    expect(resolveReviewPolicy({ ...request(), invocation: { mode: "force", sourceId: "codex-pr" } }))
      .toMatchObject({ state: "unavailable", nextAction: "stop", diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "material-fix-local-review-required" }),
      ]) });
  });
  it("admits a forced local pass after a material repair", () => {
    expect(resolveReviewPolicy({ ...request(), invocation: { mode: "force", sourceId: "delegated-agent" } }))
      .toMatchObject({ state: "ready", nextAction: "local-prepare", payload: { sourceId: "delegated-agent" } });
  });
  it("stops with its own diagnostic when the configured list omits the local source", () => {
    expect(resolveReviewPolicy({ ...request(), sources: ["codex-pr"] })).toMatchObject({ state: "unavailable", nextAction: "stop",
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "material-fix-local-source-unconfigured" })]) });
  });
});

function deltaRequest(pullRequest: number | null = 42) {
  const base = request("converged", pullRequest);
  const scope = { schemaVersion: 1 as const, predecessorProducerId: "local/complete",
    predecessorHeadSha: "b".repeat(40), basisHeadSha: "b".repeat(40), headSha: base.target.headSha, requiredFindings: [] };
  return { ...base, nextPassContext: { ...base.nextPassContext, incremental: { basis: "delta-check" as const, scope } } };
}

it.each([null, 42])("selects the local delta check with pull request %s before reserving a hosted source", pullRequest => {
  expect(resolveReviewPolicy(deltaRequest(pullRequest))).toMatchObject({ state: "ready", nextAction: "local-prepare",
    payload: { sourceId: "delegated-agent", pass: 2 } });
});

it("refuses a forced hosted source with a delta-check diagnostic", () => {
  expect(resolveReviewPolicy({ ...deltaRequest(), invocation: { mode: "force", sourceId: "codex-pr" } }))
    .toMatchObject({ state: "unavailable", nextAction: "stop", diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: "delta-check-local-review-required", message: expect.stringMatching(/delta check/iu) }),
    ]) });
});

it("selects a delta check from the complete configuration despite a historical provider suffix", () => {
  expect(resolveReviewPolicy({ ...deltaRequest(), sources: ["codex-pr"], selectionSources: ["codex-pr"],
    configuredSources: ["delegated-agent", "codex-pr"] })).toMatchObject({ state: "ready", nextAction: "local-prepare",
    payload: { sourceId: "delegated-agent" } });
});
