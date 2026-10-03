/** Local Git proof for the committed Candidate review-response continuation. */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { captureConditionalNextPassAuthorization, recordLaneAttempt, recordLaneResponsePerformance } from
  "../../src/scripts/review-gate/lane-progress.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createCandidateAttestation, createCandidateReviewResponseEvidence, createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { confirmCandidateResponseHeadContinuation } from
  "../../src/scripts/review-gate/runtime/candidate-response-head-continuation.js";

const roots: string[] = [];
const exec = createExecaGitExec();
const dispositionSetId = canonicalDigest({ disposition: "one" });
const recordPath = ".arc/system/.internal/candidates/example.json";
const boundaryPath = ".arc/system/.internal/candidates/example.boundary.json";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture(extraPath?: string) {
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
  await git("add", recordPath);
  await git("commit", "-m", "attest");
  await writeFile(join(cwd, "source.txt"), "verified fix\n");
  await git("add", "source.txt");
  await git("commit", "-m", "fix");
  const verifiedHeadSha = await git("rev-parse", "HEAD");
  const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget: { revision: originatingHeadSha, subject },
    newTarget: { revision: verifiedHeadSha, subject: createCandidateSubjectSnapshot([{ path: "source.txt",
      mode: "100644", digest: canonicalDigest({ source: "fixed" }), treatment: "reviewable" }]) },
    dispositionId: dispositionSetId, approvedBy: "owner", appliedBy: "agent", applicability: "focused",
    verificationEvidenceRefs: ["test://fix"], implementationChanged: true });
  await mkdir(join(cwd, ".arc/system/.internal/candidates"), { recursive: true });
  await writeFile(join(cwd, recordPath), serializeCandidateManagedRecord({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [response], lineageAttestations: [] }));
  await writeFile(join(cwd, boundaryPath), "boundary\n");
  if (extraPath !== undefined) await writeFile(join(cwd, extraPath), "unrelated\n");
  await git("add", ".");
  await git("commit", "-m", "record response");
  const toHeadSha = await git("rev-parse", "HEAD");
  const input = { cwd, exec, workUnit: "example", candidateId: attestation.candidateId, dispositionSetId,
    originatingHeadSha, verifiedHeadSha, fromHeadSha: verifiedHeadSha, toHeadSha, approvedBy: "owner", appliedBy: "agent" };
  return { input, git, response };
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

  it("admits the committed record head through the immutable production operation store", async () => {
    const { input } = await fixture();
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
    const before = await recordLaneResponsePerformance(store, performance);
    const pending = { ...coordinates, headSha: input.toHeadSha, attemptId: "next", logicalPass: 2,
      changeRequestId: "pull/1", sourceId: "delegated-agent", outcome: "pending" as const, consumedPass: false,
      conditionalPendingAdmission: { authorizationId: captured.authorizationId, repositoryId: "repo",
        lane: "standard" as const, lineage, producedHeadSha: input.toHeadSha, nextPass: 2, admissionId: "next",
        now: coordinates.now, confirmDispositionSetCurrent: async () => true } };
    await expect(recordLaneAttempt(store, pending)).rejects.toThrow("produced head");
    const admitted = await recordLaneAttempt(store, { ...pending, conditionalPendingAdmission: {
      ...pending.conditionalPendingAdmission, confirmResponseHeadContinuation: (continuation) =>
        confirmCandidateResponseHeadContinuation({ ...input, ...continuation }) } });
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
