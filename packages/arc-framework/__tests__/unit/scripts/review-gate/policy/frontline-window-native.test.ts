/** Native opening windows inherit portable closure facts through production pre-publication readers. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { frontlineOutcome, localOutcome } from "../../../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { createCandidateAttestation } from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../../../../src/lib/store/kinds/review/candidate/access.js";
import { readRepositoryCandidateSupersessionChain } from "../../../../../src/lib/store/kinds/review/candidate/history.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { composeReviewDispositionRecord } from "../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { LaneAttemptSchema } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { recordNativeFrontlineSkip } from "../../../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { publishNativeReviewApproval } from "../../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { createPrePublicationCompositionDependencies } from "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";

import { createRepositoryReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { resolveEvidenceBoundReviewPolicy, resolveEvidenceBoundReviewPolicyContinuation } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { ReviewPolicyCommandRequestSchema } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

it.each(["open", "skip", "clean", "settled-findings", "standard-recorded", "standard-pending"] as const)(
  "reads an ancestor's %s window through the default native pre-publication adapter", async fact => {
    const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
    await h.seedProject(projectId);
    const primary = await h.seedMeta("example"), original = candidateFixture();
    const saved = await h.seedCandidate(primary.reference.owner, original);
    const checkout = await createReviewCheckout(h);
    onTestFinished(checkout.cleanup);
    const invocation = { ...checkout, workItem: primary.reference.owner };
    const { family } = createReviewCompositionContext(invocation);
    if (family.mode !== "stored" || family.ports.inFlight.nativeFacts === undefined) throw new Error("Expected native facts");
    const lineage = { kind: "candidate" as const, candidateId: original.attestation.candidateId };
    const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
    if (fact === "skip") await recordNativeFrontlineSkip({ invocation, facts: family.ports.inFlight.nativeFacts,
      repositoryId: projectId, lineage, headSha: target.headSha, now: "2026-10-20T12:00:00Z" });
    if (fact === "clean" || fact === "settled-findings") {
      const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target, lineage,
        ...(fact === "settled-findings" ? { findings: [{ findingId: "deferred-finding", severity: "major",
          locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] } : {}) }));
      await family.ports.outcomes.create(outcome);
      if (fact === "settled-findings") await publishNativeReviewApproval({ ...family.ports, readProjectId: h.projectId,
        record: composeReviewDispositionRecord(outcome, [{ ...reviewEvidenceFixture(outcome),
          binding: { kind: "candidate", candidate: { workUnit: original.attestation.workUnit, candidateId: original.attestation.candidateId } } }],
        primary.reference.owner), now: () => "2026-10-20T12:01:00Z" });
    }
    if (fact === "standard-recorded" || fact === "standard-pending") {
      const outcome = ReviewOutcomeSchema.parse(JSON.parse(JSON.stringify(localOutcome({ target, lineage }))));
      if (fact === "standard-recorded") await family.ports.outcomes.create(outcome);
      else await recordLaneAttempt(family.ports.inFlight, { lane: "standard", repositoryId: projectId, lineage,
        headSha: target.headSha, attemptId: outcome.attemptId, logicalPass: 1, retryGeneration: 0, changeRequestId: null,
        sourceId: outcome.source.sourceId, outcome: "pending", consumedPass: false,
        local: LaneAttemptSchema.shape.local.unwrap().strip().parse({ ...outcome.local, effectiveCoverage: null }),
        now: "2026-10-20T12:00:00Z" });
    }
    const current = { ...original, attestation: createCandidateAttestation({ ...original.attestation,
      subject: original.subject, baseRevision: "e".repeat(40), attestedAt: "2026-10-20T12:02:00Z",
      supersedes: original.attestation.candidateId }) };
    await writeCandidateRecord(checkout.cwd, "example", current, saved.version, { store: h.store, owner: primary.reference.owner });
    const ancestors = await readRepositoryCandidateSupersessionChain({ ...invocation, workUnit: "example", record: current });
    expect(ancestors.map(ancestor => ancestor.candidateId)).toEqual([original.attestation.candidateId]);
    const dependencies = createPrePublicationCompositionDependencies(invocation);
    expect(await dependencies.readSingletonFrontlinePhaseClosed!(current.attestation.candidateId, ancestors)).toBe(fact !== "open");
  });

it.each(["direct", "continuation"] as const)("retains the native closed-window diagnostic through %s evidence binding", async route => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const invocation = { ...checkout, workItem: primary.reference.owner };
  const { family, publisher } = createReviewCompositionContext(invocation);
  const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = localOutcome({ target }).requirement;
  const request = { schemaVersion: 1, lane: "frontline", frontlineActive: true,
    target: { repository: "owner/repo", pullRequest: 42, headSha: target.headSha },
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count }, completedPasses: 0, attempts: [] };
  const dependencies = { sources: ["coderabbit-cli"], maxPasses: 2, stateOffBranch: true as const,
    resultReader: createRepositoryReviewResultReader(publisher, invocation), dispositionStore: family.ports.dispositions,
    confirmTarget: async () => target };
  const result = route === "direct" ? await resolveEvidenceBoundReviewPolicy(request, dependencies)
    : await resolveEvidenceBoundReviewPolicyContinuation(request, { terminalResponsePerformed: false }, dependencies);
  expect(result).toMatchObject({ state: "skipped", payload: { reason: "phase-closed" },
    diagnostics: [{ code: "frontline-window-closed" }] });
  const { stateOffBranch: ignored, ...repository } = dependencies;
  void ignored;
  expect(await resolveEvidenceBoundReviewPolicy(request, repository)).toMatchObject({ state: "skipped",
    payload: { reason: "phase-closed" }, diagnostics: [{ code: "frontline-phase-closed" }] });
  expect(ReviewPolicyCommandRequestSchema.safeParse({ ...request, stateOffBranch: true }).success).toBe(false);
});
