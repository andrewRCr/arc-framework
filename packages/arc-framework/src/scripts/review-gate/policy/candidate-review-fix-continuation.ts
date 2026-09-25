/** Durable selection of one pending Candidate-bound review-fix response. */

import {
  candidateReviewResponses,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { canonicalize, SlugSchema, sortByCanonicalBytes } from "../../../lib/kernel/index.js";
import {
  currentApprovedDispositionNode,
  type ApprovedDispositionRecord,
} from "../core/advisory-records.js";
import { validateFixAuthorization } from "../core/fix-authorization.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import { frontlineResponseBindingMatchesTarget } from
  "../core/frontline-response-binding.js";
import { parseReviewSourceReference } from "../core/review-source-reference.js";
import { LocalFrontlineOutcomeStore } from "../hosts/local/frontline-outcome-store.js";
import { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { computeFrontlineSourceBindingId } from "./frontline-operation.js";

export type PendingCandidateReviewFixAuthority =
  | { readonly status: "none" }
  | {
      readonly status: "selected";
      readonly candidateId: string;
      readonly operationId: string;
      readonly reviewedHead: string;
      readonly reviewedTarget: ReviewTarget;
    }
  | {
      readonly status: "refused";
      readonly reason:
        | "candidate-review-fix-response-ambiguous"
        | "candidate-review-fix-response-invalid";
    };

export type CandidateReviewFixAuthorityReader = (input: {
  readonly cwd: string;
  readonly workUnitId: string;
  readonly candidate: CandidateManagedRecordV1;
}) => Promise<PendingCandidateReviewFixAuthority>;

type PendingCandidateReviewFixRecord =
  | Exclude<PendingCandidateReviewFixAuthority, { readonly status: "selected" }>
  | {
      readonly status: "selected";
      readonly candidateId: string;
      readonly operationId: string;
      readonly reviewedHead: string;
      readonly record: ApprovedDispositionRecord;
    };

function recordHasExactPendingCandidateFixAuthority(record: ApprovedDispositionRecord): boolean {
  const current = currentApprovedDispositionNode(record);
  const authorization = current.fixAuthorization;
  const candidateOwnedPrivateMember = record.deliveryMember !== null
    && record.candidate !== null
    && record.source.kind === "frontline"
    && record.candidate.workUnit === record.deliveryMember.workUnitId
    && authorization?.oldHeadSha === record.deliveryMember.head;
  if (record.candidate === null || record.errand !== null || authorization === null
    || (record.deliveryMember !== null && !candidateOwnedPrivateMember)) return false;
  try {
    validateFixAuthorization(authorization);
  } catch {
    return false;
  }
  const authorizedFindingIds = sortByCanonicalBytes(
    current.approvedDisposition.dispositionSet.findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ findingId }) => findingId),
  );
  return authorizedFindingIds.length > 0
    && JSON.stringify(authorization.authorizedFindingIds) === JSON.stringify(authorizedFindingIds)
    && authorization.authorizedBy === current.approvedDisposition.approval.approvedBy
    && authorization.dispositionSetId
      === current.approvedDisposition.dispositionSet.dispositionSetId
    && authorization.oldTargetId === current.approvedDisposition.dispositionSet.targetId;
}

/**
 * Select the sole unconsumed Candidate-bound fix authorization for one active work unit.
 *
 * Candidate lineage is the consumption record. Once the approved disposition appears in a review-response
 * transition, the advisory record can no longer reopen a pending correction after recovery.
 *
 * @param input - Candidate identity and repository-common disposition records to inspect.
 * @returns The sole pending record, no pending authority, or a fail-closed refusal.
 */
export function selectPendingCandidateReviewFixRecord(input: {
  readonly workUnitId: string;
  readonly candidate: CandidateManagedRecordV1;
  readonly records: readonly ApprovedDispositionRecord[];
}): PendingCandidateReviewFixRecord {
  const workUnitId = SlugSchema.parse(input.workUnitId);
  const consumedDispositionIds = new Set(
    candidateReviewResponses(input.candidate).map(({ dispositionId }) => dispositionId),
  );
  const pending = input.records.filter((record) => {
    const current = currentApprovedDispositionNode(record);
    return record.candidate?.workUnit === workUnitId
      && record.candidate.candidateId === input.candidate.attestation.candidateId
      && current.fixAuthorization !== null
      && !consumedDispositionIds.has(current.approvedDisposition.dispositionSet.dispositionSetId);
  });
  if (pending.some((record) => !recordHasExactPendingCandidateFixAuthority(record))) {
    return { status: "refused", reason: "candidate-review-fix-response-invalid" };
  }
  if (pending.length > 1) {
    return { status: "refused", reason: "candidate-review-fix-response-ambiguous" };
  }
  const selected = pending[0];
  if (selected?.candidate === null || selected?.candidate === undefined) return { status: "none" };
  const current = currentApprovedDispositionNode(selected);
  if (current.fixAuthorization === null) return { status: "none" };
  return {
    status: "selected",
    candidateId: selected.candidate.candidateId,
    operationId: selected.operationId,
    reviewedHead: current.fixAuthorization.oldHeadSha,
    record: selected,
  };
}

async function readReviewedTarget(
  publisher: RepositoryGitCommonStatePublisher,
  selection: Extract<PendingCandidateReviewFixRecord, { readonly status: "selected" }>,
): Promise<ReviewTarget | null> {
  const operations = new LocalReviewOperationStateStore(publisher);
  const source = selection.record.source;
  if (source.kind === "attested-local") {
    const reference = parseReviewSourceReference(source.receiptRef, "attested-local");
    const operation = await operations.readOperation(reference.operationId);
    if (selection.operationId !== reference.operationId
      || operation.state?.kind !== "local-review"
      || operation.state.sourceRef !== source.localSourceRef) return null;
    return operation.state.target;
  }
  if (source.kind === "frontline") {
    const reference = parseReviewSourceReference(source.outcomeRef, "frontline");
    const [outcome, operation] = await Promise.all([
      new LocalFrontlineOutcomeStore(publisher).readOutcome(reference.operationId),
      operations.readOperation(reference.operationId),
    ]);
    const responseBinding = outcome.record?.responseBinding;
    if (selection.operationId !== reference.operationId
      || outcome.record === null
      || outcome.outcomeRef !== reference.durableRef
      || operation.state?.kind !== "frontline-run"
      || operation.state.targetId !== outcome.record.outcome.target.targetId
      || operation.state.sourceIdentity !== outcome.record.sourceIdentity
      || operation.state.outcome !== outcome.record.outcome.outcome
      || operation.state.logicalPass !== outcome.record.outcome.pass
      || operation.state.sourceBindingId !== computeFrontlineSourceBindingId(
        outcome.record.outcome.source,
        responseBinding,
      )
      || canonicalize(operation.state.responseBinding ?? null) !== canonicalize(responseBinding ?? null)
      || (responseBinding !== undefined
        && (selection.record.candidate?.workUnit !== responseBinding.candidate.workUnit
          || selection.record.candidate.candidateId !== responseBinding.candidate.candidateId
          || canonicalize(selection.record.deliveryMember) !== canonicalize(responseBinding.deliveryMember)
          || !frontlineResponseBindingMatchesTarget(outcome.record.outcome.target, responseBinding)))
      || outcome.record.outcome.outcome !== "findings") return null;
    return outcome.record.outcome.target;
  }
  const reference = parseReviewSourceReference(source.attemptRef, "hosted");
  const operation = await operations.readOperation(reference.operationId);
  if (selection.operationId !== reference.durableRef
    || operation.state?.kind !== "lane-progress"
    || operation.state.lane !== "standard") return null;
  const attempt = operation.state.attempts.find(({ attemptId }) => attemptId === reference.durableRef);
  if ((attempt?.outcome !== "findings" && attempt?.outcome !== "settled-findings")
    || attempt.hosted === undefined
    || attempt.sourceId !== attempt.hosted.requirement.acceptableSources.find(
      ({ sourceKind, qualifier }) => sourceKind === "hosted" && qualifier === attempt.sourceId,
    )?.qualifier
    || operation.state.repositoryId !== attempt.hosted.reviewTarget.repositoryId
    || attempt.headSha !== attempt.hosted.target.headSha
    || attempt.changeRequestId !== `pull/${attempt.hosted.target.pullRequest}`
    || attempt.hosted.reviewTarget.headSha !== attempt.hosted.target.headSha
    || (attempt.hosted.reviewTarget.kind === "delivery-member"
      ? attempt.hosted.vehicle === undefined
        || attempt.hosted.vehicle.head !== attempt.hosted.reviewTarget.headSha
      : attempt.hosted.vehicle !== undefined)) return null;
  return attempt.hosted.reviewTarget;
}

/**
 * Read pending Candidate review-fix authority from repository-common advisory and source state.
 *
 * @param input - Repository, work-unit, and Candidate coordinates for the authority read.
 * @returns One source-validated pending authority, no authority, or a fail-closed refusal.
 */
export async function readPendingCandidateReviewFixAuthority(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly workUnitId: string;
  readonly candidate: CandidateManagedRecordV1;
}): Promise<PendingCandidateReviewFixAuthority> {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const records = await new LocalApprovedDispositionRecordStore(publisher).listDispositionRecords();
  const selected = selectPendingCandidateReviewFixRecord({
    workUnitId: input.workUnitId,
    candidate: input.candidate,
    records,
  });
  if (selected.status !== "selected") return selected;
  try {
    const reviewedTarget = await readReviewedTarget(publisher, selected);
    const authorization = currentApprovedDispositionNode(selected.record).fixAuthorization;
    if (reviewedTarget === null || authorization === null
      || reviewedTarget.targetId !== authorization.oldTargetId
      || reviewedTarget.headSha !== authorization.oldHeadSha) {
      return { status: "refused", reason: "candidate-review-fix-response-invalid" };
    }
    return {
      status: "selected",
      candidateId: selected.candidateId,
      operationId: selected.operationId,
      reviewedHead: selected.reviewedHead,
      reviewedTarget,
    };
  } catch {
    return { status: "refused", reason: "candidate-review-fix-response-invalid" };
  }
}
