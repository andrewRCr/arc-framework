/** Native Candidate settlement and lane history read portable responses without branch-carried review records. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localOutcome, frontlineOutcome } from "../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation, createCandidateReviewResponseEvidence, createCandidateLineageAttestation,
  CandidateManagedRecordV1Schema } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../src/lib/store/kinds/review/evidence/access.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { approveDispositionSet, createDispositionSet } from "../../src/scripts/review-gate/core/dispositions.js";
import { currentApprovedDispositionNode } from "../../src/scripts/review-gate/core/advisory-records.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { createLineageReviewComposer } from "../../src/scripts/integration/lineage-review-composition.js";
import { composeCandidateResponseConfirmation, confirmCandidateResponseAction } from "../../src/scripts/integration/candidate-response-confirmation.js";
import { bindReviewSourceReferenceForInvocation } from "../../src/scripts/review-gate/runtime/source-invocation.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { recordLaneResponsePerformance } from "../../src/scripts/review-gate/lane-progress.js";
import { readReviewLane } from "../../src/scripts/review-gate/runtime/lane-read-composition.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import type { GitExec } from "../../src/lib/git/exec.js";

async function fixture(kind: "local" | "private-frontline" | "history") {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/example", linkedAs: "adopted", excluded: [] }],
  });
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await writeFile(join(cwd, "reviewed.txt"), "original\n");
  await git("add", ".");
  await git("commit", "-m", "Configure Candidate fixture");
  const base = await git("rev-parse", "HEAD"), baseTree = await git("rev-parse", "HEAD^{tree}");
  await git("switch", "-c", "topic/example");
  await writeFile(join(cwd, "reviewed.txt"), "changed\n");
  await git("commit", "-am", "Implement reviewed change");
  const oldHead = await git("rev-parse", "HEAD"), oldTree = await git("rev-parse", "HEAD^{tree}");
  const oldSubject = await collectGitCandidateSubject({ cwd, exec, name: "example", baseBranch: "main" });
  if (oldSubject.status !== "collected") throw new Error(oldSubject.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: oldSubject.target.subject,
    baseRevision: oldHead, attestedBy: "andrew", attestedAt: "2026-10-20T18:00:00Z", verificationEvidenceRef: "verification://root" });
  const initial = CandidateManagedRecordV1Schema.parse({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: oldSubject.target.subject, transitions: [], lineageAttestations: [] });
  const initialStored = await h.reference.seedCandidate(primary.reference.owner, initial);
  const rootTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: projectId, baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha: oldHead, headTree: oldTree });
  const privateHead = await git("commit-tree", oldTree, "-p", base, "-m", "Private member view");
  const member = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174000", deliverableId: canonicalDigest({ member: 1 }), head: privateHead });
  const memberTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: projectId, baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha: privateHead, headTree: oldTree });
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "reviewed.txt:1",
    evidenceUrlOrId: "source:reviewed.txt:1", sourceOrdinal: 1 }, ...(kind === "history" ? [{ findingId: "finding-2",
    severity: "major" as const, locus: "reviewed.txt:2", evidenceUrlOrId: "source:reviewed.txt:2", sourceOrdinal: 2 }] : [])];
  const candidate = { workUnit: attestation.workUnit, candidateId: attestation.candidateId };
  const outcome = ReviewOutcomeSchema.parse(kind !== "private-frontline" ? localOutcome({ target: rootTarget, findings, outcome: "findings",
    lineage: { kind: "candidate", candidateId: attestation.candidateId }, vehicle: { kind: "work-unit", identity: "example" } })
    : frontlineOutcome({ target: memberTarget, findings, lineage: { kind: "delivery-member", planId: member.planId,
      deliverableId: member.deliverableId, workUnitId: member.workUnitId },
      responseBinding: { candidate: { ...candidate, target: rootTarget }, deliveryMember: member } }));
  const outcomes = createReviewOutcomePort(h.reference.store, primary.reference.owner);
  const evidence = createReviewEvidencePort(h.reference.store, primary.reference.owner);
  await outcomes.create(outcome);
  const approved = reviewEvidenceFixture(outcome, "fix");
  const { dispositionSetId: ignored, ...setInput } = approved.dispositionSet;
  void ignored;
  const dispositionSet = kind === "history" ? createDispositionSet({ ...setInput,
    findings: setInput.findings.map(finding => finding.findingId !== "finding-2" ? finding : { ...finding,
      sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject",
      rationale: "The source does not support this finding." }) }) : approved.dispositionSet;
  const value = { ...approved, dispositionSet, approval: approveDispositionSet({ dispositionSet,
    approvedBy: "andrew", approvedAt: "2026-10-20T18:01:00Z" }), binding: kind !== "private-frontline"
      ? { kind: "candidate" as const, candidate } : { kind: "candidate-member" as const, candidate, deliveryMember: member } };
  const record = composeReviewDispositionRecord(outcome, [value], primary.reference.owner);
  await publishNativeReviewApproval({ outcomes, evidence, record, readProjectId: h.reference.projectId,
    now: () => "2026-10-20T18:01:00Z" });
  await writeFile(join(cwd, "reviewed.txt"), "changed and repaired\n");
  await git("commit", "-am", "Apply approved repair");
  const approvedHead = await git("rev-parse", "HEAD");
  const current = await collectGitCandidateSubject({ cwd, exec, name: "example", baseBranch: "main" });
  if (current.status !== "collected") throw new Error(current.detail);
  const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget: { revision: oldHead, subject: initial.subject }, newTarget: current.target,
    dispositionId: record.currentDispositionSetId, approvedBy: value.approval.approvedBy,
    appliedBy: value.dispositionSet.proposedBy, applicability: "full", verificationEvidenceRefs: ["verification://fix"], implementationChanged: true });
  const convergence = createCandidateLineageAttestation({ candidateId: attestation.candidateId, responseId: response.responseId,
    target: response.newTarget, scope: "full", attestedBy: "andrew", attestedAt: "2026-10-20T18:02:00Z",
    verificationEvidenceRef: "verification://convergence" });
  await writeCandidateRecord(cwd, "example", { ...initial, transitions: [response], lineageAttestations: [convergence] },
    initialStored.version, { store: h.reference.store, owner: primary.reference.owner });
  return { ...h, cwd, primary, record, response, outcome, approvedHead, approvedBase: base,
    invocation: { ...h.native, workItem: primary.reference.owner } };
}

it("confirms a private native frontline response without a Candidate file or local source state", async () => {
  const f = await fixture("private-frontline");
  const input = { ...f.invocation, workUnit: "example", approvedHead: f.approvedHead,
    approvedBase: f.approvedBase, approved: f.record };
  const confirmed = await composeCandidateResponseConfirmation(input);
  expect(confirmed).toMatchObject({ order: -1, action: { operationId: f.outcome.attemptId,
    responseId: f.response.responseId, dispositionId: f.record.currentDispositionSetId } });
  if (confirmed === null) throw new Error("expected private confirmation");
  expect(await confirmCandidateResponseAction({ ...input, action: confirmed.action })).toEqual({ state: "confirmed" });
  expect(await createLineageReviewComposer(f.invocation)("example", f.approvedHead, f.approvedBase))
    .toEqual({ dispositionIds: [f.record.currentDispositionSetId], actions: [confirmed.action] });
  const other = await f.reference.seedMeta("other");
  const foreignRef = await bindReviewSourceReferenceForInvocation({ ...f.invocation, workItem: other.reference.owner },
    { kind: "frontline", operationId: f.outcome.attemptId, durableRef: f.outcome.attemptId });
  if (f.record.source.kind !== "frontline") throw new Error("expected frontline source");
  await expect(composeCandidateResponseConfirmation({ ...input,
    approved: { ...f.record, source: { ...f.record.source, outcomeRef: foreignRef } } })).rejects.toThrow();
  expect(await composeCandidateResponseConfirmation(input)).toEqual(confirmed);
}, 30_000);

it("composes native local settlement from its outcome and policy snapshot without an operation record", async () => {
  const f = await fixture("local");
  const before = await f.reference.store.version();
  const result = await createLineageReviewComposer(f.invocation)("example", f.approvedHead, f.approvedBase);
  if (f.record.source.kind !== "attested-local") throw new Error("expected local source");
  expect(result).toMatchObject({ dispositionIds: [f.record.currentDispositionSetId], actions: [{ channel: "review-response",
    originTarget: f.outcome.target, fixTarget: { headSha: f.approvedHead }, request: {
      source: { kind: "attested-local", receiptRef: f.record.source.receiptRef },
      policyRequest: currentApprovedDispositionNode(f.record).responsePolicyRequest } }] });
  expect(result.actions).toHaveLength(1);
  expect(await f.reference.store.version()).toEqual(before);
}, 30_000);

it("reads native lane history with a rejection, two completed looks, and one complete pass without changing facts", async () => {
  const f = await fixture("history");
  const context = createReviewCompositionContext(f.invocation);
  if (context.family.mode !== "stored") throw new Error("expected native family");
  await recordLaneResponsePerformance(context.family.ports.inFlight, { lane: "standard", repositoryId: f.outcome.target.repositoryId,
    headSha: f.outcome.target.headSha, lineage: f.outcome.lineage, attemptId: f.outcome.attemptId,
    dispositionSetId: f.record.currentDispositionSetId, producedHeadSha: f.approvedHead,
    candidateResponseId: f.response.responseId, now: "2026-10-20T18:03:00Z" });
  const tree = (await f.native.exec("git", ["rev-parse", "HEAD^{tree}"], { cwd: f.cwd })).stdout.trim();
  const { targetId: ignored, ...coordinates } = f.outcome.target;
  void ignored;
  const target = createReviewTarget({ ...coordinates, headSha: f.approvedHead, headTree: tree });
  const followUp = ReviewOutcomeSchema.parse(localOutcome({ target, lineage: f.outcome.lineage, logicalPass: 2,
    coverageAdmission: { requestedCoverage: "incremental", correctionScope: { schemaVersion: 1,
      predecessorProducerId: f.outcome.attemptId, predecessorHeadSha: f.outcome.target.headSha,
      basisHeadSha: f.outcome.target.headSha, headSha: f.approvedHead,
      requiredFindings: [{ producerId: f.outcome.attemptId, findingId: "finding-1", locus: "reviewed.txt:1" }] } } }));
  await context.family.ports.outcomes.create(followUp);
  await f.reference.seedBoundary(f.primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
    mode: "pre-publication-review", workUnit: "example", candidateId: f.response.candidateId,
    candidateSubjectDigest: f.response.oldTarget.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  const exec: GitExec = async (command, args, options) => {
    if (command !== "gh") return f.native.exec(command, args, options);
    if (args[0] === "repo" && args[1] === "view") return { stdout: '{"nameWithOwner":"owner/repo"}', stderr: "" };
    if (args[0] === "pr" && args[1] === "list") return { stdout: "[]", stderr: "" };
    throw new Error(`Unexpected GitHub observation: ${args.join(" ")}`);
  };
  const before = await f.reference.store.version();
  const input = { ...f.native, exec };
  const result = await readReviewLane({ schemaVersion: 1 }, input);
  expect(result).toMatchObject({ state: "ready", payload: { rejections: [{ findingId: "finding-2",
    sourceVerification: "not-supported", reason: "The source does not support this finding." }],
    facts: { completePasses: 1, materialTrend: [{ logicalPass: 1, coverage: "complete" }, { logicalPass: 2, coverage: "fix-check" }] },
    lastLook: { producerId: followUp.attemptId, coverage: "incremental", outcome: "clean" } } });
  expect(await readReviewLane({ schemaVersion: 1 }, input)).toEqual(result);
  expect(await f.reference.store.version()).toEqual(before);
  for (const namespace of ["operations", "outcomes", "evidence"] as const)
    expect(await context.publisher.list({ root: "review-gate", namespace })).toEqual([]);
}, 30_000);
