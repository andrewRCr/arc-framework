/** Local Git proof for the committed Candidate review-response continuation. */

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { captureConditionalNextPassAuthorization, recordLaneAttempt, recordLaneResponsePerformance } from
  "../../src/scripts/review-gate/lane-progress.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { canonicalDigest, canonicalize } from "../../src/lib/kernel/index.js";
import { createStandardReviewReservation, projectPublicationBoundary,
  rebindSingletonPublicationResponseBoundary, type IntegrationBoundaryLocus } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { createCandidateAttestation, createCandidateReviewResponseEvidence, createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord, parseCandidateManagedRecord, type CandidateReviewResponseEvidenceV1 } from "../../src/lib/work-unit/candidate-attestation.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createDispositionSet, proposeDispositionSet, approveDispositionState } from
  "../../src/scripts/review-gate/core/dispositions.js";
import { ApprovedDispositionRecordSchema } from "../../src/scripts/review-gate/core/advisory-records.js";
import { createFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import { confirmCandidateResponseHeadContinuation, createCandidateResponseHeadContinuationReader } from
  "../../src/scripts/review-gate/runtime/candidate-response-head-continuation.js";

const roots: string[] = [];
const exec = createExecaGitExec();
const recordPath = ".arc/system/.internal/candidates/example.json";
const boundaryPath = ".arc/system/.internal/candidates/example.boundary.json";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

function approvalFixture(candidateId: string, headSha: string, tree: string) {
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo", baseRef: "main", diffBaseSha: headSha, diffBaseTree: tree, headSha, headTree: tree });
  const obligation = { obligation: "required" as const, reasons: ["routine-code" as const],
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: "full-final" as const, count: 1 as const };
  const set = createDispositionSet({ schemaVersion: 2, semanticsVersion: "review-gate/v2", targetId: target.targetId,
    producerId: "producer", resultDigest: canonicalDigest("result"), policyVersion: canonicalDigest("policy"),
    rubricVersion: obligation.rubricVersion, rubricDigest: obligation.rubricDigest,
    proposedBy: "agent", proposedVerification: "focused", findings: [{ findingId: "finding",
      sourceIdentity: "delegated-agent", locus: "source.txt:1", reportedSeverity: "major", sourceVerification: "verified",
      verifiedSeverity: "major", disposition: "fix", verificationRefs: ["test://origin"], title: "Repair source",
      issue: "Source requires a fix.", recommendation: "Fix the source.", rationale: "Confirmed from source.", openQuestions: [] }] });
  const approvedDisposition = approveDispositionState({ proposed: proposeDispositionSet(set),
    approvedBy: "owner", approvedAt: "2026-10-03T12:00:00Z" });
  return ApprovedDispositionRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "review-advisory/v1",
    repositoryId: "repo", operationId: "producer", candidate: { workUnit: "example", candidateId },
    errand: null, deliveryMember: null, source: { kind: "attested-local", receiptRef: "test://receipt", localSourceRef: "test://source" },
    currentDispositionSetId: set.dispositionSetId, approvedDispositionLineage: [{ approvedDisposition,
      responsePolicyRequest: { schemaVersion: 1, target: { repository: "owner/repo", pullRequest: 1, headSha },
        lane: "standard", frontlineActive: false, standardReview: obligation, completedPasses: 1,
        attempts: [{ sourceId: "delegated-agent", outcome: "findings", reviewOperationId: "producer" }] },
      fixAuthorization: createFixAuthorization({ dispositionState: approvedDisposition, oldTarget: target }),
      errandFixResponse: null, deliveryMemberFixResponse: null, predecessorDispositionSetId: null, successorDispositionSetId: null }] });
}

async function fixture(extraPath?: string,
  boundaryEdit?: (boundary: IntegrationBoundaryLocus) => string | null, previousBoundary = true) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-response-head-"));
  roots.push(cwd);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await git("init", "-b", "main");
  await git("config", "user.name", "ARC Test");
  await git("config", "user.email", "arc@example.test");
  await writeFile(join(cwd, "source.txt"), "original\n");
  await git("add", "source.txt");
  await git("commit", "-m", "original");
  const originatingHeadSha = await git("rev-parse", "HEAD");
  const subject = createCandidateSubjectSnapshot([{ path: "source.txt", mode: "100644",
    digest: canonicalDigest({ source: "original" }), treatment: "reviewable" }]);
  const attestation = createCandidateAttestation({ workUnit: "example", subject,
    baseRevision: originatingHeadSha, attestedBy: "owner", attestedAt: "2026-10-03T12:00:00Z",
    verificationEvidenceRef: "test://initial" });
  await mkdir(join(cwd, ".arc/system/.internal/candidates"), { recursive: true });
  await writeFile(join(cwd, recordPath), serializeCandidateManagedRecord({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [], lineageAttestations: [] }));
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "feat/example",
    candidateId: attestation.candidateId, candidateSubjectDigest: subject.subjectDigest, changeRequest: null,
    reservation: createStandardReviewReservation({ candidateId: attestation.candidateId, sourceId: "codex-pr",
      repository: "owner/repo", headSha: originatingHeadSha, obligation: { obligation: "required",
        reasons: ["routine-code"], rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest, retrigger: "full-final", count: 1 } }) });
  if (previousBoundary) await writeFile(join(cwd, boundaryPath), canonicalize(boundary));
  await git("add", ".");
  await git("commit", "-m", "attest");
  await writeFile(join(cwd, "source.txt"), "verified fix\n");
  await git("add", "source.txt");
  await git("commit", "-m", "fix");
  const verifiedHeadSha = await git("rev-parse", "HEAD");
  const approvedRecord = approvalFixture(attestation.candidateId, originatingHeadSha,
    await git("rev-parse", `${originatingHeadSha}^{tree}`));
  const dispositionSetId = approvedRecord.currentDispositionSetId;
  const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget: { revision: originatingHeadSha, subject },
    newTarget: { revision: verifiedHeadSha, subject: createCandidateSubjectSnapshot([{ path: "source.txt",
      mode: "100644", digest: canonicalDigest({ source: "fixed" }), treatment: "reviewable" }]) },
    dispositionId: dispositionSetId, approvedBy: "owner", appliedBy: "agent", applicability: "focused", approvedVerification: "focused",
    verificationEvidenceRefs: ["test://fix"], implementationChanged: true });
  await mkdir(join(cwd, ".arc/system/.internal/candidates"), { recursive: true });
  await writeFile(join(cwd, recordPath), serializeCandidateManagedRecord({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [response], lineageAttestations: [] }));
  const rebound = rebindSingletonPublicationResponseBoundary({ stored: boundary, workUnit: "example",
    response, requirePublished: true });
  if (rebound === null) throw new Error("fixture requires a published boundary");
  const boundaryContent = boundaryEdit === undefined ? canonicalize(rebound) : boundaryEdit(rebound);
  if (boundaryContent === null) await rm(join(cwd, boundaryPath), { force: true });
  else await writeFile(join(cwd, boundaryPath), boundaryContent);
  if (extraPath !== undefined) await writeFile(join(cwd, extraPath), "unrelated\n");
  await git("add", ".");
  await git("commit", "-m", "record response");
  const toHeadSha = await git("rev-parse", "HEAD");
  const input = { cwd, exec, workUnit: "example", candidateId: attestation.candidateId, dispositionSetId,
    originatingHeadSha, verifiedHeadSha, expectedResponseId: response.responseId, fromHeadSha: verifiedHeadSha, toHeadSha, approvedBy: "owner", appliedBy: "agent" };
  return { input, git, response, boundary, approvedRecord };
}

describe("committed Candidate response continuation", () => {
  it("proves the required record-only commit against its exact verified response", async () => {
    const { input } = await fixture();
    await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(true);
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      dispositionSetId: canonicalDigest({ disposition: "foreign" }) })).resolves.toBe(false);
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      candidateId: canonicalDigest({ candidate: "foreign" }) })).resolves.toBe(false);
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      originatingHeadSha: input.verifiedHeadSha })).resolves.toBe(false);
    await expect(confirmCandidateResponseHeadContinuation({ ...input, appliedBy: "foreign" })).resolves.toBe(false);
    await expect(confirmCandidateResponseHeadContinuation({ ...input, approvedBy: "foreign" })).resolves.toBe(false);
  });

  it("accepts a response commit with an unchanged boundary", async () => {
    const { input, git, boundary } = await fixture();
    await git("reset", "--soft", input.fromHeadSha);
    await writeFile(join(input.cwd, boundaryPath), canonicalize(boundary));
    await git("add", ".");
    await git("commit", "-m", "record without boundary movement");
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      toHeadSha: await git("rev-parse", "HEAD") })).resolves.toBe(true);
  });

  const boundaryEdits: Array<[string, (boundary: IntegrationBoundaryLocus) => string | null]> = [
    ["subject", (boundary) => canonicalize({ ...boundary, candidateSubjectDigest: canonicalDigest("foreign") })],
    ["reservation", (boundary) => canonicalize({ ...boundary, reservation: null })],
    ["terminus", (boundary) => canonicalize({ ...boundary, terminus: { schemaVersion: 1,
      semanticsVersion: "review-terminus/v1", kind: "owner-accepted", lane: "standard",
      acceptedBy: "foreign", completedPasses: 1 } })],
    ["locus", (boundary) => canonicalize({ ...boundary, locus: "hosted-review-pending", nextAction: {
      kind: "continue-pre-publication-review", command: "arc review pre-publication example",
      interactionText: "Continue review." } })],
    ["malformed bytes", () => "boundary\n"],
    ["deletion", () => null],
  ];
  it.each(boundaryEdits)("refuses unrelated boundary %s changes", async (_name, edit) => {
    const { input } = await fixture(undefined, edit);
    await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(false);
  });

  it("refuses a newly added boundary without its prior publication binding", async () => {
    const { input } = await fixture(undefined, undefined, false);
    await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(false);
  });

  const responseEdits: Array<[string, (response: CandidateReviewResponseEvidenceV1) => CandidateReviewResponseEvidenceV1]> = [
    ["subject", (response) => createCandidateReviewResponseEvidence({ ...response, newTarget: { ...response.newTarget,
      subject: createCandidateSubjectSnapshot([{ path: "source.txt", mode: "100644", treatment: "reviewable",
        digest: canonicalDigest("substituted source") }]) } })],
    ["applicability", (response) => createCandidateReviewResponseEvidence({ ...response, applicability: "full" })],
    ["approved verification", (response) => createCandidateReviewResponseEvidence({ ...response, approvedVerification: "targeted" })],
    ["evidence", (response) => createCandidateReviewResponseEvidence({ ...response, verificationEvidenceRefs: ["test://fabricated"] })],
    ["implementation status", (response) => createCandidateReviewResponseEvidence({ ...response, implementationChanged: false })],
  ];
  it.each(responseEdits)("refuses a rewritten response with substituted %s", async (_name, edit) => {
    const { input, git, response } = await fixture();
    const original = parseCandidateManagedRecord(await readFile(join(input.cwd, recordPath), "utf8"));
    if (original === null) throw new Error("expected Candidate");
    const substituted = edit(response);
    const content = canonicalize({ ...original, transitions: [substituted] });
    if (_name === "implementation status") expect(parseCandidateManagedRecord(content)).toBeNull();
    else expect(parseCandidateManagedRecord(content)).not.toBeNull();
    expect(substituted.responseId).not.toBe(input.expectedResponseId);
    await git("reset", "--soft", input.fromHeadSha);
    await writeFile(join(input.cwd, recordPath), content);
    await git("add", ".");
    await git("commit", "-m", "substitute response");
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      toHeadSha: await git("rev-parse", "HEAD") })).resolves.toBe(false);
  });

  it("admits the committed record head through the immutable production operation store", async () => {
    const { input, approvedRecord } = await fixture();
    const dispositionSetId = input.dispositionSetId;
    const bound: GitExec = (command, args, options) => exec(command, args, { ...options, cwd: input.cwd });
    const store = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(bound, input.cwd));
    const lineage = { kind: "candidate" as const, candidateId: input.candidateId };
    const coordinates = { lane: "standard" as const, repositoryId: "repo", headSha: input.originatingHeadSha,
      lineage, attemptId: "producer", now: "2026-10-03T12:00:00Z" };
    await recordLaneAttempt(store, { ...coordinates, changeRequestId: "pull/1", sourceId: "delegated-agent",
      outcome: "findings", consumedPass: true });
    const captured = await captureConditionalNextPassAuthorization(store, { ...coordinates, producerId: "producer",
      dispositionSetId, authorizedBy: "owner", exhaustedPassCount: 1, nextPass: 2 });
    const performance = { ...coordinates, dispositionSetId, producedHeadSha: input.verifiedHeadSha };
    const unbound = await recordLaneResponsePerformance(store, performance);
    const beforeBinding = unbound.attempts[0]?.responsePerformance;
    const proof = createCandidateResponseHeadContinuationReader({ cwd: input.cwd, exec: bound, operationStore: store,
      dispositionStore: { readDispositionRecord: async () => approvedRecord,
        appendDispositionRecord: async () => { throw new Error("proof must not write approval"); } } });
    const continuation = { repositoryId: "repo", lineage, producerId: "producer", dispositionSetId,
      originatingHeadSha: input.originatingHeadSha, fromHeadSha: input.verifiedHeadSha, toHeadSha: input.toHeadSha };
    await expect(proof(continuation)).resolves.toBe(false);
    const before = await recordLaneResponsePerformance(store, { ...performance,
      candidateResponseId: input.expectedResponseId, now: "2026-10-03T13:00:00Z" });
    expect(before.attempts[0]?.responsePerformance).toEqual({ ...beforeBinding, candidateResponseId: input.expectedResponseId });
    await expect(proof(continuation)).resolves.toBe(true);
    await expect(recordLaneResponsePerformance(store, { ...performance,
      candidateResponseId: canonicalDigest("substituted") })).rejects.toThrow("digest replay conflicts");
    const { version } = await store.readOperation(before.operationId);
    for (const digest of [undefined, canonicalDigest("substituted")]) {
      const next = structuredClone(before);
      const recorded = next.attempts[0]?.responsePerformance;
      if (recorded === undefined) throw new Error("expected response performance");
      if (digest === undefined) delete recorded.candidateResponseId;
      else recorded.candidateResponseId = digest;
      await expect(store.publishOperation(next, version)).rejects.toThrow("immutable-response-performance-transition");
    }
    const pending = { ...coordinates, headSha: input.toHeadSha, attemptId: "next", logicalPass: 2,
      changeRequestId: "pull/1", sourceId: "delegated-agent", outcome: "pending" as const, consumedPass: false,
      conditionalPendingAdmission: { authorizationId: captured.authorizationId, repositoryId: "repo",
        lane: "standard" as const, lineage, producedHeadSha: input.toHeadSha, nextPass: 2, admissionId: "next",
        now: coordinates.now, confirmDispositionSetCurrent: async () => true } };
    await expect(recordLaneAttempt(store, pending)).rejects.toThrow("produced head");
    const admitted = await recordLaneAttempt(store, { ...pending, conditionalPendingAdmission: {
      ...pending.conditionalPendingAdmission, confirmResponseHeadContinuation: proof } });
    expect(admitted.completedPasses).toBe(1);
    expect(admitted.attempts[1]?.headSha).toBe(input.toHeadSha);
    expect(admitted.attempts[0]?.responsePerformance).toEqual(before.attempts[0]?.responsePerformance);
    const authority = admitted.attempts[0]?.conditionalPassAuthorizations?.authorizations[0];
    expect(authority).toMatchObject({ authorizationId: captured.authorizationId, status: "consumed",
      producedHeadSha: input.verifiedHeadSha, admissionId: "next" });
    await expect(recordLaneResponsePerformance(store, performance)).resolves.toEqual(admitted);
  });

  it.each(["source.txt", ".arc/system/.internal/candidates/foreign.json"])(
    "refuses a commit also changing %s", async (extraPath) => {
      const { input } = await fixture(extraPath);
      await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(false);
    });

  it.each(["source.txt", "untracked.txt"])("refuses dirty or untracked %s", async (path) => {
    const { input } = await fixture();
    await writeFile(join(input.cwd, path), "unstaged change\n");
    await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(false);
  });

  it("refuses other ancestry and a moved head", async () => {
    const { input, git } = await fixture();
    await expect(confirmCandidateResponseHeadContinuation({ ...input,
      fromHeadSha: input.originatingHeadSha, verifiedHeadSha: input.originatingHeadSha })).resolves.toBe(false);
    await git("commit", "--allow-empty", "-m", "later");
    await expect(confirmCandidateResponseHeadContinuation(input)).resolves.toBe(false);
  });
});
