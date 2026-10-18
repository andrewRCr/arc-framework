/** Real Git coverage of Candidate correction heads following an approved fix. */
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  createCandidateAttestation, createCandidateReviewResponseEvidence,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import { createReviewTarget, createReviewRequirement } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { confirmPerformedResponse } from "../../src/scripts/review-gate/policy/performed-response-proof.js";
import { approvedRecord, findingsHostedResult, performedFix } from "../fixtures/review-response-proof.js";

const roots: string[] = [];
const exec = createExecaGitExec();
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-performed-response-"));
  roots.push(cwd);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await git("init", "-b", "main");
  await git("config", "user.name", "ARC Test");
  await git("config", "user.email", "arc@example.test");
  await writeFile(join(cwd, "source.txt"), "base\n");
  await git("add", ".");
  await git("commit", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  const baseTree = await git("rev-parse", "HEAD^{tree}");
  await git("checkout", "-b", "feat/example");
  await writeFile(join(cwd, "source.txt"), "unfixed contribution\n");
  await git("commit", "-am", "contribution");
  const oldHead = await git("rev-parse", "HEAD");
  const oldTree = await git("rev-parse", "HEAD^{tree}");
  const collect = async (revision: string) => {
    const result = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec, revision });
    if (result.status !== "collected") throw new Error(result.detail);
    return result.target;
  };
  const oldTarget = await collect(oldHead);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: oldTarget.subject,
    baseRevision: base, attestedBy: "owner", attestedAt: "2026-10-03T12:00:00Z", verificationEvidenceRef: "test://initial" });
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha: oldHead, headTree: oldTree });
  const template = findingsHostedResult(["major"]);
  if (template.kind !== "hosted") throw new Error("expected hosted producer");
  const requirement = createReviewRequirement({ target, projection: { obligation: template.requirement.obligation, reasons: template.requirement.reasons,
    rubricVersion: template.requirement.rubricVersion, rubricDigest: template.requirement.rubricDigest,
    retrigger: template.requirement.retrigger, count: template.requirement.count },
    acceptableSources: template.requirement.acceptableSources, initialAdmission: template.requirement.initialAdmission });
  if (requirement === null) throw new Error("expected review requirement");
  const lineage = { kind: "candidate" as const, candidateId: attestation.candidateId };
  const predecessor = { ...template, target, requirement,
    hostedTarget: { ...template.hostedTarget, headSha: oldHead },
    admission: { ...template.admission, lineage, policyVersion: requirement.policyVersion } };
  const record = approvedRecord(predecessor, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  await writeFile(join(cwd, "source.txt"), "fixed contribution\n");
  await git("commit", "-am", "fix");
  const fixHead = await git("rev-parse", "HEAD");
  const fixedTarget = await collect(fixHead);
  const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
    oldTarget, newTarget: fixedTarget, dispositionId: record.currentDispositionSetId,
    approvedBy: "owner", appliedBy: "agent", applicability: "focused", approvedVerification: "focused",
    verificationEvidenceRefs: ["test://fix"], implementationChanged: true });
  const candidate: CandidateManagedRecordV1 = { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: oldTarget.subject, transitions: [response], lineageAttestations: [] };
  await mkdir(join(cwd, ".arc/system/.internal/candidates"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/.internal/candidates/example.json"), JSON.stringify(candidate));
  await git("add", ".");
  await git("commit", "-m", "record response");
  const performance = { ...performedFix(predecessor, record), producedHeadSha: fixHead };
  const proof = async () => {
    const currentTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
      repositoryId: "repo-1", baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree,
      headSha: await git("rev-parse", "HEAD"), headTree: await git("rev-parse", "HEAD^{tree}") });
    return confirmPerformedResponse({ predecessor, currentTarget, currentLineage: lineage,
      dispositionStore: { readDispositionRecord: async () => record,
        appendDispositionRecord: async () => { throw new Error("read-only proof"); } },
      readResponsePerformance: async () => performance,
      candidateProof: { cwd, baseRef: "main", exec, candidate, observeTarget: async () => currentTarget } });
  };
  return { cwd, git, proof };
}

describe("performed Candidate response proof", () => {
  it("proves the record commit after a fix, and refuses a later reviewable code change", async () => {
    const { cwd, git, proof } = await fixture();
    await expect(proof()).resolves.toBe("applicable");
    await writeFile(join(cwd, "source.txt"), "unreviewed change\n");
    await git("commit", "-am", "change source after fix");
    await expect(proof()).resolves.toBe("unavailable");
  });
});
