/** Prove the required record commit that follows an immutable verified Candidate response. */

import type { GitExec } from "../../../lib/git/exec.js";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { ApprovedDispositionRecordStore, ReviewOperationStateStore } from "../core/ports.js";
import type { ConfirmResponseHeadContinuation, ResponseHeadContinuationInput } from "../core/response-head-continuation.js";
import { canonicalize, type CanonicalDigest } from "../../../lib/kernel/index.js";
import { candidateReviewResponses, parseCandidateManagedRecord } from
  "../../../lib/work-unit/candidate-attestation.js";
import type { CandidateReviewResponseEvidenceV1 } from "../../../lib/work-unit/candidate-attestation.js";
import { parseIntegrationBoundaryLocus, rebindSingletonPublicationResponseBoundary } from
  "../policy/integration-boundary-locus.js";
import { resolveCandidateRecordRelativePath } from "../../../lib/work-unit/candidate-record-store.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import { resolveSubmissionBoundaryPath } from "../../../lib/work-unit/submission-boundary-store.js";

function readMatchingResponse(input: {
  content: string;
  previousContent: string;
  candidateId: CanonicalDigest;
  dispositionSetId: CanonicalDigest;
  expectedResponseId: CanonicalDigest;
  originatingHeadSha: string;
  verifiedHeadSha: string;
  approvedBy: string;
  appliedBy: string;
}): CandidateReviewResponseEvidenceV1 | null {
  const record = parseCandidateManagedRecord(input.content);
  const previous = parseCandidateManagedRecord(input.previousContent);
  if (record?.attestation.candidateId !== input.candidateId) return null;
  const responses = candidateReviewResponses(record);
  const matching = responses.filter((response) => response.dispositionId === input.dispositionSetId);
  const response = matching.length === 1 ? matching[0] : undefined;
  const matches = previous !== null && response !== undefined && response.responseId === input.expectedResponseId
    && response.responseId === responses.at(-1)?.responseId
    && canonicalize(record) === canonicalize({ ...previous, transitions: [...previous.transitions, response] })
    && response.oldTarget.revision === input.originatingHeadSha
    && response.newTarget.revision === input.verifiedHeadSha
    && response.approvedBy === input.approvedBy && response.appliedBy === input.appliedBy;
  return matches ? response : null;
}

async function boundaryMatches(
  read: (args: string[]) => Promise<string>,
  input: { workUnit: string; fromHeadSha: string; toHeadSha: string },
  path: string,
  response: CandidateReviewResponseEvidenceV1,
): Promise<boolean> {
  try {
    const [before, after] = await Promise.all([
      read(["show", `${input.fromHeadSha}:${path}`]), read(["show", `${input.toHeadSha}:${path}`]),
    ]);
    const stored = parseIntegrationBoundaryLocus(JSON.parse(before) as unknown);
    const committed = parseIntegrationBoundaryLocus(JSON.parse(after) as unknown);
    const expected = rebindSingletonPublicationResponseBoundary({
      stored, workUnit: input.workUnit, response, requirePublished: false,
    });
    return expected !== null && canonicalize(committed) === canonicalize(expected);
  } catch {
    return false;
  }
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
  expectedResponseId: CanonicalDigest;
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
  const response = readMatchingResponse({ ...input, content, previousContent });
  if (response === null || (paths.includes(boundaryPath)
    && !await boundaryMatches(read, input, boundaryPath, response))) return false;
  const [finalHead, finalDirty] = await Promise.all([
    read(["rev-parse", "HEAD"]), read(["status", "--porcelain=v1", "-z"]),
  ]);
  return finalHead.trim() === input.toHeadSha && finalDirty === "";
}

function candidateApprovalMatches(
  record: ApprovedDispositionRecord | null,
  input: ResponseHeadContinuationInput,
): record is ApprovedDispositionRecord & { candidate: NonNullable<ApprovedDispositionRecord["candidate"]> } {
  return input.lineage.kind === "candidate" && record !== null && record.candidate !== null
    && record.deliveryMember === null && record.repositoryId === input.repositoryId
    && record.candidate.candidateId === input.lineage.candidateId && record.currentDispositionSetId === input.dispositionSetId;
}

function candidatePerformanceMatches(
  performance: LaneResponsePerformance | undefined,
  input: ResponseHeadContinuationInput,
): performance is LaneResponsePerformance & { candidateResponseId: CanonicalDigest } {
  return performance?.candidateResponseId !== undefined && performance.producerId === input.producerId
    && performance.dispositionSetId === input.dispositionSetId
    && performance.originatingHeadSha === input.originatingHeadSha && performance.producedHeadSha === input.fromHeadSha;
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
  operationStore: Pick<ReviewOperationStateStore, "readOperation">;
}): ConfirmResponseHeadContinuation {
  return async (input) => {
    if (input.lineage.kind !== "candidate") return false;
    const record = await repository.dispositionStore.readDispositionRecord(input.producerId);
    if (!candidateApprovalMatches(record, input)) return false;
    const node = currentApprovedDispositionNode(record);
    const approved = node.approvedDisposition;
    if (node.fixAuthorization === null || approved.dispositionSet.producerId !== input.producerId
      || node.responsePolicyRequest.target.headSha !== input.originatingHeadSha) return false;
    const owner = await readLaneProgressOwner(repository.operationStore, {
      lane: node.responsePolicyRequest.lane, repositoryId: input.repositoryId,
      headSha: input.originatingHeadSha, lineage: input.lineage,
    });
    const performance = owner?.attempts.find(({ attemptId }) => attemptId === input.producerId)?.responsePerformance;
    if (!candidatePerformanceMatches(performance, input)) return false;
    return confirmCandidateResponseHeadContinuation({
      ...repository, ...input, workUnit: record.candidate.workUnit, candidateId: record.candidate.candidateId,
      verifiedHeadSha: input.fromHeadSha, expectedResponseId: performance.candidateResponseId,
      approvedBy: approved.approval.approvedBy, appliedBy: approved.dispositionSet.proposedBy,
    });
  };
}
