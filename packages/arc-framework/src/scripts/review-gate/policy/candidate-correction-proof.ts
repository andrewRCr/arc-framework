/** Candidate subject proof for a fix head and its later record-only successors. */
import type { GitExec } from "../../../lib/git/exec.js";
import { collectGitCandidateSubject } from "../../../lib/work-unit/git-candidate-subject.js";
import { candidateReviewResponses, type CandidateManagedRecordV1, type CandidateReviewResponseEvidenceV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { laneSubjectOwnerMatches, type LaneSubjectLineage } from "../core/lane-admission.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";

type PrivateCandidateCorrectionInput = {
  readonly predecessor: ReviewResult;
  readonly currentTarget: ReviewTarget;
  readonly currentLineage: LaneSubjectLineage;
  readonly currentResult?: ReviewResult;
  readonly candidate: CandidateManagedRecordV1 | null;
  readonly cwd: string;
  readonly baseRef: string;
  readonly exec: GitExec;
  readonly observeTarget: () => Promise<ReviewTarget>;
  readonly readResponsePerformance: (
    predecessor: ReviewResult,
  ) => Promise<LaneResponsePerformance | null>;
};

function privateCandidateTargetsMatch(input: PrivateCandidateCorrectionInput): boolean {
  const { predecessor, currentTarget, currentLineage, candidate } = input;
  return predecessor.kind !== "frontline" && predecessor.originalOutcome === "findings"
    && predecessor.target.kind === "change-set" && currentTarget.kind === "change-set"
    && currentLineage.kind === "candidate"
    && predecessor.repositoryId === currentTarget.repositoryId
    && laneSubjectOwnerMatches(predecessor.admission.lineage, currentLineage)
    && candidate?.attestation.candidateId === currentLineage.candidateId
    && candidate.attestation.workUnit.trim() !== ""
    && predecessor.target.baseRef === currentTarget.baseRef
    && predecessor.target.diffBaseSha === currentTarget.diffBaseSha
    && predecessor.target.diffBaseTree === currentTarget.diffBaseTree
    && currentTarget.baseRef === input.baseRef;
}

async function matchingPrivateCandidateResponse(
  input: PrivateCandidateCorrectionInput,
  candidate: CandidateManagedRecordV1,
  candidateId: string,
): Promise<CandidateReviewResponseEvidenceV1 | null> {
  const performance = await input.readResponsePerformance(input.predecessor);
  if (performance?.producerId !== input.predecessor.producerId
    || performance.originatingHeadSha !== input.predecessor.target.headSha) return null;
  const responses = candidateReviewResponses(candidate).filter((response) =>
    response.candidateId === candidateId
    && response.oldTarget.revision === input.predecessor.target.headSha
    && response.newTarget.revision === performance.producedHeadSha
    && response.dispositionId === performance.dispositionSetId);
  return responses.length === 1 ? responses[0] ?? null : null;
}

async function privateCandidateGitProof(
  input: PrivateCandidateCorrectionInput,
  candidate: CandidateManagedRecordV1,
  response: CandidateReviewResponseEvidenceV1,
): Promise<boolean> {
  const git = async (args: string[]) => (await input.exec("git", args, {
    cwd: input.cwd,
    objectAccess: "local-only",
  })).stdout.trim();
  const baseRevision = await git(["rev-parse", "--verify", `refs/heads/${input.baseRef}^{commit}`]);
  for (const revision of new Set([
    input.predecessor.target.headSha, response.newTarget.revision, input.currentTarget.headSha,
  ])) {
    if (await git(["merge-base", "--all", revision, baseRevision])
      !== input.predecessor.target.diffBaseSha) return false;
  }
  const collect = async (revision: string) => collectGitCandidateSubject({
    cwd: input.cwd,
    name: candidate.attestation.workUnit,
    baseBranch: input.baseRef,
    baseRevision,
    revision,
    exec: input.exec,
  });
  const old = await collect(input.predecessor.target.headSha);
  const produced = await collect(response.newTarget.revision);
  if (old.status !== "collected" || produced.status !== "collected"
    || old.target.subject.subjectDigest !== response.oldTarget.subject.subjectDigest
    || produced.target.subject.subjectDigest !== response.newTarget.subject.subjectDigest
    || await git(["rev-parse", "--verify", `${input.predecessor.target.headSha}^{tree}`])
      !== input.predecessor.target.headTree) return false;
  const historical = input.currentResult !== undefined;
  const current = input.currentTarget.headSha === response.newTarget.revision
    ? produced : await collect(input.currentTarget.headSha);
  if (current.status !== "collected"
    || current.target.subject.subjectDigest !== response.newTarget.subject.subjectDigest
    || await git(["rev-parse", "--verify", `${input.currentTarget.headSha}^{tree}`])
      !== input.currentTarget.headTree) return false;
  const live = await input.observeTarget();
  return historical
    ? live.repositoryId === input.currentTarget.repositoryId
      && live.baseRef === input.currentTarget.baseRef
    : live.targetId === input.currentTarget.targetId;
}

/** Prove a new private Candidate correction review without asserting old-result clearance. */
export async function confirmPrivateCandidateCorrectionBasis(
  input: PrivateCandidateCorrectionInput,
): Promise<IncrementalPredecessorApplicability> {
  if (!privateCandidateTargetsMatch(input) || input.candidate === null
    || input.currentLineage.kind !== "candidate") return "unavailable";
  try {
    const response = await matchingPrivateCandidateResponse(
      input, input.candidate, input.currentLineage.candidateId,
    );
    if (response === null) return "unavailable";
    return await privateCandidateGitProof(input, input.candidate, response)
      ? "applicable" : "unavailable";
  } catch {
    return "unavailable";
  }
}

