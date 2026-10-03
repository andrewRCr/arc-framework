/** Prove the required record commit that follows an immutable verified Candidate response. */

import type { GitExec } from "../../../lib/git/exec.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import type { ApprovedDispositionRecordStore } from "../core/ports.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { canonicalize, type CanonicalDigest } from "../../../lib/kernel/index.js";
import { candidateReviewResponses, parseCandidateManagedRecord } from
  "../../../lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../../../lib/work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../../../lib/work-unit/submission-boundary-store.js";

function responseMatches(input: {
  content: string;
  previousContent: string;
  candidateId: CanonicalDigest;
  dispositionSetId: CanonicalDigest;
  originatingHeadSha: string;
  verifiedHeadSha: string;
  approvedBy: string;
  appliedBy: string;
}): boolean {
  const record = parseCandidateManagedRecord(input.content);
  const previous = parseCandidateManagedRecord(input.previousContent);
  if (record?.attestation.candidateId !== input.candidateId) return false;
  const responses = candidateReviewResponses(record);
  const matching = responses.filter((response) => response.dispositionId === input.dispositionSetId);
  const response = matching.length === 1 ? matching[0] : undefined;
  return previous !== null && response !== undefined && response.responseId === responses.at(-1)?.responseId
    && canonicalize(record) === canonicalize({ ...previous, transitions: [...previous.transitions, response] })
    && response.oldTarget.revision === input.originatingHeadSha
    && response.newTarget.revision === input.verifiedHeadSha
    && response.approvedBy === input.approvedBy && response.appliedBy === input.appliedBy;
}

/**
 * Confirm one clean, direct record-only successor of the verified fix head.
 *
 * @param input - Repository and the exact Candidate, producer target, disposition, and verified fix bindings.
 * @returns Whether local Git proves the required committed response continuation, with no source movement.
 */
export async function confirmCandidateResponseHeadContinuation(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  candidateId: CanonicalDigest;
  dispositionSetId: CanonicalDigest;
  originatingHeadSha: string;
  verifiedHeadSha: string;
  fromHeadSha: string;
  toHeadSha: string;
  approvedBy: string;
  appliedBy: string;
}): Promise<boolean> {
  if (input.fromHeadSha !== input.verifiedHeadSha || input.fromHeadSha === input.toHeadSha) return false;
  const read = async (args: string[]) => (await input.exec("git", args, {
    cwd: input.cwd, objectAccess: "local-only",
  })).stdout;
  const recordPath = resolveCandidateRecordRelativePath(input.workUnit);
  const boundaryPath = resolveSubmissionBoundaryPath(input.workUnit);
  const [head, dirty, parents, changed] = await Promise.all([
    read(["rev-parse", "HEAD"]),
    read(["status", "--porcelain=v1", "-z"]),
    read(["rev-list", "--parents", "-n", "1", input.toHeadSha]),
    read(["diff", "--name-only", "--no-renames", "-z", input.fromHeadSha, input.toHeadSha]),
  ]);
  if (head.trim() !== input.toHeadSha || dirty !== ""
    || parents.trim() !== `${input.toHeadSha} ${input.fromHeadSha}`) return false;
  const paths = changed.split("\0").filter((path) => path !== "");
  if (!paths.includes(recordPath) || paths.some((path) => path !== recordPath && path !== boundaryPath)) return false;
  const [content, previousContent] = await Promise.all([
    read(["show", `${input.toHeadSha}:${recordPath}`]), read(["show", `${input.fromHeadSha}:${recordPath}`]),
  ]);
  if (!responseMatches({ ...input, content, previousContent })) return false;
  const [finalHead, finalDirty] = await Promise.all([
    read(["rev-parse", "HEAD"]), read(["status", "--porcelain=v1", "-z"]),
  ]);
  return finalHead.trim() === input.toHeadSha && finalDirty === "";
}

/**
 * Bind local Git continuation proof to the exact durable approval and Candidate owner.
 *
 * @param repository - Checkout, Git adapter, and immutable approved-disposition reader.
 * @returns A fail-closed confirmation boundary for settlement and pass admission.
 */
export function createCandidateResponseHeadContinuationReader(repository: {
  cwd: string;
  exec: GitExec;
  dispositionStore: ApprovedDispositionRecordStore;
}): ConfirmResponseHeadContinuation {
  return async (input) => {
    if (input.lineage.kind !== "candidate") return false;
    const record = await repository.dispositionStore.readDispositionRecord(input.producerId);
    if (record?.candidate === null || record === null || record.deliveryMember !== null
      || record.repositoryId !== input.repositoryId || record.candidate.candidateId !== input.lineage.candidateId
      || record.currentDispositionSetId !== input.dispositionSetId) return false;
    const node = currentApprovedDispositionNode(record);
    const approved = node.approvedDisposition;
    if (node.fixAuthorization === null || approved.dispositionSet.producerId !== input.producerId
      || node.responsePolicyRequest.target.headSha !== input.originatingHeadSha) return false;
    return confirmCandidateResponseHeadContinuation({
      ...repository, ...input, workUnit: record.candidate.workUnit, candidateId: record.candidate.candidateId,
      verifiedHeadSha: input.fromHeadSha,
      approvedBy: approved.approval.approvedBy, appliedBy: approved.dispositionSet.proposedBy,
    });
  };
}
