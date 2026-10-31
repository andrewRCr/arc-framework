/** Native stored grants leave incremental passes free while explicit contradictory inputs retain policy refusal. */
import { expect, it, onTestFinished } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { ReviewPolicyCommandRequestSchema, resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { projectNativePolicyGrants } from "../../../../../src/scripts/review-gate/runtime/native-policy-grants.js";
import { errandPolicyGrants } from "../../../../../src/scripts/review-gate/runtime/native-errand-grants.js";
import { composeNativePolicyGrants } from "../../../../../src/scripts/review-gate/runtime/native-policy-grants.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { bindNativeReviewPorts } from "../../../../helpers/store/native-review-ports.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { extraPassDecision } from "../../../../fixtures/review-decision.js";
import { RepositoryGitCommonStatePublisher } from "../../../../../src/lib/git-common-state.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { StoredReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";

const target = { repository: "owner/repo", pullRequest: 42, headSha: "a".repeat(40) };
const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target, lane: "standard", completedPasses: 5,
  attempts: [], standardReview: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
const ceiling = { exhaustedPassCount: 5, nextPass: 6, decisionKey: canonicalDigest({ decision: "ceiling" }) };
const full = { ...ceiling, target, lane: "standard" as const };
const context = { sources: ["delegated-agent"], maxPasses: 2, stateOffBranch: true,
  nextPassContext: { completePasses: 2, convergence: "unconverged", responseDue: false,
    incremental: { basis: "fix-check", scope: { schemaVersion: 1, predecessorProducerId: "local/material-five",
      predecessorHeadSha: "b".repeat(40), basisHeadSha: "b".repeat(40), headSha: target.headSha,
      requiredFindings: [{ producerId: "local/material-five", findingId: "material-one", locus: "src/example.ts:7" }] } } } };

it.each(["generic", "errand"] as const)("keeps an automatic %s ceiling grant out of incremental admission", caller => {
  const projected = caller === "generic" ? projectNativePolicyGrants(request, { judgment: { ceilingOverride: ceiling } }, true)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: true, additional: true } }, true) };
  expect(resolveReviewPolicy({ ...projected, ...context, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: false } });
  const complete = caller === "generic" ? projectNativePolicyGrants(request, { judgment: { ceilingOverride: ceiling } }, false)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: true, additional: true } }, false) };
  expect(resolveReviewPolicy({ ...complete, ...context, chosenCoverage: "complete" }))
    .toMatchObject({ state: "ready", payload: { pass: 6, ceilingOverrideApplied: true } });
});

it.each(["generic", "errand"] as const)("preserves explicit %s grant refusal beside incremental coverage", caller => {
  const explicit = { ...request, ceilingOverride: full };
  const projected = caller === "generic" ? projectNativePolicyGrants(explicit, { judgment: { ceilingOverride: ceiling } }, true)
    : { ...request, ...errandPolicyGrants({ ceilingOverride: full, automaticGrants: { ceiling: false, additional: false } }, true) };
  expect(resolveReviewPolicy({ ...projected, ...context, chosenCoverage: "incremental" }))
    .toMatchObject({ state: "invalid-override", payload: { reason: "incremental-coverage" } });
});


// A checkout whose review target, live work unit, and lane progress read, but whose Candidate subject cannot be observed:
// no Git repository backs it, so reading the current Candidate target fails.
async function storedGrantInput(lane: "frontline" | "standard", decisionLane: "frontline" | "standard", targetReadable = true) {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example", { owner: "test-user", branch: null }, { kind: "active" },
    { branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }] });
  const candidate = candidateFixture();
  await h.seedCandidate(primary.reference.owner, candidate);
  const head = "a".repeat(40), base = "b".repeat(40);
  const checkout = await createReviewCheckout(h, { script: !targetReadable ? [] : [
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: base }] },
    { match: ["cat-file", "-t", head], responses: [{ stdout: "commit" }] },
    { match: ["cat-file", "-t", base], responses: [{ stdout: "commit" }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["merge-base", "--all", base, head], responses: [{ stdout: base }] },
    { match: ["rev-parse", `${base}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: "d".repeat(40) }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy("topic/opaque", { kind: "work-unit", name: "example" });
  const owner = primary.reference.owner;
  const stored = extraPassDecision();
  if (stored.choice.kind !== "extra-pass") throw new Error("Expected an extra-pass decision");
  // No pass has completed in this checkout, so a ceiling at zero passes is the live one.
  await createReviewDecisionPort(h.store, owner).create({ ...stored, lane: decisionLane, choice: { ...stored.choice, passCount: 0 }, subject: { ...stored.subject,
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId }, headSha: head } });
  const ports = bindNativeReviewPorts({ store: h.store, owner, publisher: new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd),
    projectId: h.projectId });
  const policyRequest = ReviewPolicyCommandRequestSchema.parse({ ...request, lane, target: { ...target, headSha: head } });
  return { policyRequest, compose: () => composeNativePolicyGrants({ ...checkout, workItem: owner, projectId: h.projectId,
    request: policyRequest, operationStore: ports.inFlight, resultReader: new StoredReviewResultReader({ outcomes: ports.outcomes, evidence: ports.evidence, readProjectId: h.projectId }),
    baseBranch: "main", incremental: false }) };
}

it("keeps a policy request as given, reading no review target, when only another lane's extra-pass decision is stored",
  async () => {
    const h = await storedGrantInput("frontline", "standard", false);
    await expect(h.compose()).resolves.toEqual(h.policyRequest);
  });

it("takes a stored extra-pass decision without observing the Candidate subject when the request records none", async () => {
  const h = await storedGrantInput("standard", "standard");
  await expect(h.compose()).resolves.toMatchObject({ lane: "standard", ceilingOverride: { exhaustedPassCount: 0, nextPass: 1 } });
});
