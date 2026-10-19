/** Review command remedies for material fixes that need a local next pass. */
import { describe, expect, it } from "vitest";
import { handleReviewResolve, handleReviewLocalPrepare } from "../../../src/handlers/review.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { ReviewPolicyCommandRequestSchema, resolveReviewPolicy } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { ReviewDriverAdmissionError } from "../../../src/scripts/review-gate/policy/review-execution-admission.js";
import { HostedReviewAdmissionError, hostedRequestAdmissionRemedy } from "../../../src/scripts/review-gate/runtime/review-policy-remedy.js";

const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1,
  target: { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) }, lane: "standard",
  standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: "standard" }), retrigger: "full-final", count: 1 },
  completedPasses: 1, attempts: [], invocation: { mode: "force", sourceId: "codex-pr" } });
function resolution(configured = true) {
  return resolveReviewPolicy({ ...request, sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"], maxPasses: 4,
    nextPassContext: { completePasses: 1, convergence: "unconverged", responseDue: false, incremental: null } });
}
const localRequest = { schemaVersion: 1, evaluatorIdentity: "reviewer", routingFacts: {} };

describe("material-fix source remedies", () => {
  it.each([true, false])("returns a resolve remedy with local source configured=%s", async configured => {
    const output: string[] = []; const exitCodes: number[] = [];
    await handleReviewResolve("-", { resolveRoot: () => "/project", readText: async () => JSON.stringify(request),
      resolve: async () => resolution(configured), write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
    expect(JSON.parse(output.join(""))).toMatchObject({ diagnostics: resolution(configured).diagnostics, error: { code: "invalid-input" },
      remedy: { argv: ["arc", "review", "resolve", "-"], stdin: request,
        text: configured ? expect.stringContaining("delegated-agent") : expect.stringContaining("review.standard_sources") } });
    if (!configured) expect(JSON.parse(output.join("")).remedy.text).not.toContain("Owner's stop");
    expect(exitCodes).toEqual([1]);
  });
  it.each([true, false])("returns a local prepare remedy with local source configured=%s", async configured => {
    const output: string[] = []; const exitCodes: number[] = [];
    await handleReviewLocalPrepare("-", { resolveRoot: () => "/project", readText: async () => JSON.stringify(localRequest),
      prepare: async () => { throw new ReviewDriverAdmissionError("refused", resolution(configured), request); },
      write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
    expect(JSON.parse(output.join(""))).toMatchObject({ diagnostics: resolution(configured).diagnostics, error: { code: "invalid-input" }, remedy: {
      text: configured ? expect.stringContaining("delegated-agent") : expect.stringContaining("review.standard_sources"),
      argv: ["arc", "review", "local", "prepare", "-"], stdin: localRequest } });
    if (!configured) expect(JSON.parse(output.join("")).remedy.text).not.toContain("Owner's stop");
    expect(exitCodes).toEqual([1]);
  });
  it.each([true, false])("returns a hosted admission remedy with local source configured=%s", configured => {
    const error = new ReviewDriverAdmissionError("refused", resolution(configured), request);
    const target = { repository: "owner/repo", headRef: "feature", headSha: request.target.headSha };
    const remedy = hostedRequestAdmissionRemedy(new HostedReviewAdmissionError(error, target));
    expect(remedy?.text).toContain(configured ? "delegated-agent" : "review.standard_sources");
    expect(remedy?.text).not.toContain("Owner's stop");
  });
  it("names the Owner's stop for an Errand whose configured list omits the local source", () => {
    const error = new ReviewDriverAdmissionError("refused", resolution(false), request);
    const target = { repository: "owner/repo", headRef: "feature", headSha: request.target.headSha };
    expect(hostedRequestAdmissionRemedy(new HostedReviewAdmissionError(error, target, true))?.text)
      .toContain("Owner's stop disclosed as resting on fixes no reviewer re-examined");
  });

});
