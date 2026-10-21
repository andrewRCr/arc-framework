/** Pre-publication response actions select portable producer outcomes for native and imported reviews. */
import { expect, it, onTestFinished } from "vitest";
import { createNativeReviewApprovalFixture } from "../../../../fixtures/native-review-approval.js";
import { storedCandidateApproval } from "../../../../fixtures/review-family-access.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { boundaryContinuation } from "../../../../fixtures/review-boundary.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createRepositoryReviewResultReader } from "../../../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { projectPendingResponseSource } from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { projectPrePublicationReview, PrePublicationReviewRequestSchema } from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";
import { ContinuePrePublicationActionSchema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectReviewPolicyAttempt } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { readLaneProgress, readLaneResponsePerformance } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { bindReviewPolicyEvidence } from "../../../../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { deriveReviewNextPassContext } from "../../../../../src/scripts/review-gate/policy/review-next-pass.js";
import { scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";

it.each(["native", "imported"] as const)("responds to the %s local outcome named by a pre-publication action", async origin => {
  const candidate = candidateFixture();
  const native = origin === "native" ? await createNativeReviewApprovalFixture("local", "fix",
    { kind: "candidate", candidateId: candidate.attestation.candidateId }) : null;
  const imported = origin === "imported" ? await storedCandidateApproval(candidate) : null;
  const harness = native?.h ?? imported!.harness, owner = native?.primary.reference.owner ?? imported!.owner;
  const producerId = native?.outcome.attemptId ?? imported!.producer.producerId;
  const checkout = await createReviewCheckout(harness);
  onTestFinished(checkout.cleanup);
  const invocation = { cwd: checkout.cwd, exec: checkout.exec, store: harness.store, workItem: owner };
  const context = createReviewCompositionContext(invocation);
  const result = await createRepositoryReviewResultReader(context.publisher, invocation).readResult(producerId);
  if (result.kind !== "attested-local") throw new Error("Expected the stored local producer");
  const outcome = await createReviewOutcomePort(harness.store, owner).read(producerId);
  if (outcome === null || outcome.value.local === undefined) throw new Error("Expected portable local facts");
  expect(result.localSourceRef).toBe(outcome.value.local.sourceDigest);
  const record = await context.family.ports.dispositions.readDispositionRecord(producerId);
  if (origin === "imported") expect(record?.source).toHaveProperty("localSourceRef", outcome.value.local.sourceDigest);
  const progress = await readLaneProgress(context.family.ports.inFlight, { lane: "standard",
    repositoryId: result.repositoryId, headSha: result.target.headSha, lineage: result.admission.lineage });
  if (progress.status !== "recorded") throw new Error("Expected the outcome's durable progress");
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = result.requirement;
  const standardReview = { obligation, reasons, rubricVersion, rubricDigest, retrigger, count };
  const policyTarget = { repository: "owner/repo", pullRequest: null, headSha: result.target.headSha };
  const policy = { schemaVersion: 1, target: policyTarget, standardReview, maxPasses: 2 };
  const resultReader = createRepositoryReviewResultReader(context.publisher, invocation);
  const nextPassContext = await deriveReviewNextPassContext({ predecessor: result, completedPasses: progress.completedPasses,
    completePasses: progress.completePasses, currentTarget: result.target, currentLineage: result.admission.lineage,
    standardReview, resultReader, dispositionStore: context.family.ports.dispositions,
    readResponsePerformance: previous => readLaneResponsePerformance(context.family.ports.inFlight, previous) });
  const standard = await bindReviewPolicyEvidence({ schemaVersion: 1, target: policyTarget, standardReview, lane: "standard",
    completedPasses: progress.completedPasses, attempts: progress.attempts.map(projectReviewPolicyAttempt) }, {
    stateOffBranch: true, allowUnapprovedFindings: true, sources: ["delegated-agent"], maxPasses: 2, nextPassContext,
    resultReader, dispositionStore: context.family.ports.dispositions,
    confirmTarget: async () => result.target });
  const request = PrePublicationReviewRequestSchema.parse({ schemaVersion: 1, workUnit: "example",
    candidateId: candidate.attestation.candidateId, target: result.target, selfReview: "settled",
    reservationTarget: { kind: "pinned-head", repository: policyTarget.repository, headSha: policyTarget.headSha },
    routingFacts: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" }, activity: { selfReview: true, frontlineReview: true } },
    frontline: { ...policy, lane: "frontline", frontlineActive: true, sources: ["coderabbit-cli"],
      invocation: { mode: "skip" }, completedPasses: 0, attempts: [] },
    standard,
    pendingResponse: { frontline: null, standard: projectPendingResponseSource(result, "incomplete", false) },
    candidate: { subjectDigest: candidate.subject.subjectDigest, implementationChanged: false,
      convergenceVerification: "satisfied", convergenceScope: null } });
  const envelope = projectPrePublicationReview(request, boundaryContinuation, { terminus: null, readinessBinding: null });
  const action = ContinuePrePublicationActionSchema.parse(envelope.nextAction);
  expect(action).toMatchObject({ command: "arc review respond -", responseOperationId: producerId });
  if (action.responseSource?.kind !== "attested-local") throw new Error("Expected a local response route");
  expect(parseReviewSourceReference(action.responseSource.receiptRef, "attested-local", true)).toMatchObject({
    workItem: owner, operationId: producerId, durableRef: reviewOutcomeKey(outcome.value) });
  const dependencies = createRespondDependencies({ ...invocation, rawGit: scriptRawGitExec([]).exec });
  const response = await respondToReviewCommand(withReviewReport({ schemaVersion: 1, source: action.responseSource,
    proposal: { proposedVerification: "full", severityGatingPolicy: { minorGating: "record-only" },
      findings: result.findings.map(finding => ({ findingId: finding.findingId, sourceVerification: "verified",
        verificationRefs: [finding.evidenceUrlOrId], verifiedSeverity: finding.severity, disposition: "defer",
        title: "Known limitation", issue: "The reported behavior remains visible.", rationale: "Defer this bounded repair.",
        recommendation: "Track the deferred repair.", openQuestions: [] })) } }), {
    ...dependencies, confirmTarget: async () => ({ state: "current", target: result.target }),
    resolveLocalActors: async () => ({ approverIdentity: result.request.authorIdentity, proposerIdentity: "arc-cli/0.1.0" }),
  });
  expect(response).toMatchObject({ state: "awaiting-approval", payload: { operationId: producerId,
    proposal: { dispositionSet: { producerId, findings: [{ findingId: result.findings[0]?.findingId }] } } } });
  expect(await context.publisher.list({ root: "review-gate", namespace: "operations" })).toEqual([]);
  expect(canonicalDigest(result.target)).toBe(canonicalDigest(outcome.value.target));
});
