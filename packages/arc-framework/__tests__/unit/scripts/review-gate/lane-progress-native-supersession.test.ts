/** Superseded native results retain history without blocking their successor's review. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { localOutcome } from "../../../fixtures/review-outcome.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import { createCandidateAttestation } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../../../src/lib/store/kinds/review/candidate/access.js";
import { readRepositoryCandidateSupersessionChain } from "../../../../src/lib/store/kinds/review/candidate/history.js";
import { createReviewOutcomePort } from "../../../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewCompositionContext } from "../../../../src/scripts/review-gate/runtime/composition-context.js";
import { laneProgressOperationId, readCandidateInheritedLaneProgress } from "../../../../src/scripts/review-gate/lane-progress.js";
import { livePredecessorReviewAttempt } from "../../../../src/scripts/review-gate/lane-progress-supersession.js";
import { reviewEvidenceFixture } from "../../../fixtures/review-evidence.js";
import { composeReviewDispositionRecord } from "../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../../src/scripts/review-gate/runtime/native-review-approval.js";

it("keeps a late unsettled predecessor result without inheriting its findings or pass on another clone", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), original = candidateFixture();
  const candidate = await h.seedCandidate(primary.reference.owner, original);
  const first = await createReviewCheckout(h), second = await createReviewCheckout(h);
  onTestFinished(first.cleanup);
  onTestFinished(second.cleanup);
  const firstFamily = createReviewCompositionContext({ ...first, workItem: primary.reference.owner }).family;
  const secondFamily = createReviewCompositionContext({ ...second, workItem: primary.reference.owner }).family;
  const outcomes = createReviewOutcomePort(h.store, primary.reference.owner);
  const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const lineage = { kind: "candidate" as const, candidateId: original.attestation.candidateId };
  const clean = ReviewOutcomeSchema.parse(localOutcome({ target, lineage }));
  await outcomes.create(clean);
  const current = { ...original, attestation: createCandidateAttestation({ ...original.attestation,
    subject: original.subject, baseRevision: "e".repeat(40), attestedAt: "2026-10-20T12:00:00Z",
    supersedes: original.attestation.candidateId }) };
  await writeCandidateRecord(first.cwd, "example", current, candidate.version, { store: h.store, owner: primary.reference.owner });
  const input = { lane: "standard" as const, repositoryId: projectId, headSha: target.headSha,
    ancestors: await readRepositoryCandidateSupersessionChain({ ...second, workUnit: "example", record: current,
      workItem: primary.reference.owner }) };
  expect(await readCandidateInheritedLaneProgress(secondFamily.ports.inFlight, input))
    .toMatchObject({ inheritedCompletedPasses: 1, inheritedCompletePasses: 1 });
  const late = ReviewOutcomeSchema.parse({ ...localOutcome({ target, lineage, logicalPass: 2, outcome: "findings",
    findings: [{ findingId: "late-finding", severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:late", sourceOrdinal: 1 }] }),
    endedAt: "2026-10-20T12:01:00Z" });
  const stored = await outcomes.create(late);
  const result = await readCandidateInheritedLaneProgress(secondFamily.ports.inFlight, input);
  expect(result).toMatchObject({ inheritedCompletedPasses: 1, inheritedCompletePasses: 1 });
  expect(result.ancestorOwners.flatMap(({ owner }) => owner?.attempts ?? []).map(attempt => attempt.attemptId))
    .toEqual([clean.attemptId]);
  expect(await outcomes.read(late.attemptId)).toEqual(stored);
  const laneId = laneProgressOperationId({ lane: "standard", repositoryId: projectId, headSha: target.headSha, lineage });
  const stillCurrent = await firstFamily.ports.inFlight.readOperation(laneId);
  if (stillCurrent.state?.kind !== "lane-progress") throw new Error("Expected the predecessor's own lane");
  expect(livePredecessorReviewAttempt(stillCurrent.state)).toMatchObject({ attemptId: late.attemptId, outcome: "findings" });
});

it("settles a current Candidate's deferred findings before inheriting its pass after replacement", async () => {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), original = candidateFixture();
  const candidate = await h.seedCandidate(primary.reference.owner, original);
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);
  const { family } = createReviewCompositionContext({ ...checkout, workItem: primary.reference.owner });
  if (family.mode !== "stored") throw new Error("Expected native review facts");
  const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
  const lineage = { kind: "candidate" as const, candidateId: original.attestation.candidateId };
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, lineage, outcome: "findings", findings: [{
    findingId: "deferred-finding", severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:deferred", sourceOrdinal: 1 }] }));
  const stored = await family.ports.outcomes.create(outcome);
  const laneId = laneProgressOperationId({ lane: "standard", repositoryId: projectId, headSha: target.headSha, lineage });
  const before = await family.ports.inFlight.readOperation(laneId);
  if (before.state?.kind !== "lane-progress") throw new Error("Expected the current findings lane");
  expect(livePredecessorReviewAttempt(before.state)).toMatchObject({ attemptId: outcome.attemptId, outcome: "findings" });
  const approved = { ...reviewEvidenceFixture(outcome), binding: { kind: "candidate" as const,
    candidate: { workUnit: original.attestation.workUnit, candidateId: original.attestation.candidateId } } };
  await publishNativeReviewApproval({ ...family.ports, readProjectId: h.projectId,
    record: composeReviewDispositionRecord(outcome, [approved], primary.reference.owner), now: () => "2026-10-20T12:00:00Z" });
  const after = await family.ports.inFlight.readOperation(laneId);
  if (after.state?.kind !== "lane-progress") throw new Error("Expected the approved findings lane");
  expect(livePredecessorReviewAttempt(after.state)).toBeNull();
  const current = { ...original, attestation: createCandidateAttestation({ ...original.attestation,
    subject: original.subject, baseRevision: "e".repeat(40), attestedAt: "2026-10-20T12:01:00Z",
    supersedes: original.attestation.candidateId }) };
  await writeCandidateRecord(checkout.cwd, "example", current, candidate.version, { store: h.store, owner: primary.reference.owner });
  const ancestors = await readRepositoryCandidateSupersessionChain({ ...checkout, workUnit: "example", record: current,
    workItem: primary.reference.owner });
  expect(await readCandidateInheritedLaneProgress(family.ports.inFlight, { lane: "standard", repositoryId: projectId,
    headSha: target.headSha, ancestors })).toMatchObject({ inheritedCompletedPasses: 1, inheritedCompletePasses: 1,
    ancestorOwners: [{ owner: { attempts: [{ attemptId: outcome.attemptId, outcome: "settled-findings" }] } }] });
  expect(await family.ports.outcomes.read(outcome.attemptId)).toEqual(stored);
});
