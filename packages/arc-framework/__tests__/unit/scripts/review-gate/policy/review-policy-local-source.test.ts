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
