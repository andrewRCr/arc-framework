/** Compose earlier-attempt discovery, D4 projection, and canonical Candidate authority. */

import type { RawGitExec } from "../../../lib/git/exec.js";
import {
  candidateReviewApplicabilitySelections,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import { sameDeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { ReviewOperationStateSnapshot } from "../core/ports.js";
import {
  EarlierReviewAttemptQuerySchema,
  queryEarlierReviewAttempts,
  type EarlierReviewAttemptCandidate,
  type EarlierReviewAttemptQuery,
} from "./earlier-review-attempts.js";
import { projectGitReviewContributionApplicability } from
  "./git-review-contribution-applicability.js";
import {
  gitCandidateRecordAtHead,
  projectMechanicalReviewApplicabilityCarry,
} from "./mechanical-review-applicability-carry.js";
import {
  reduceReviewApplicabilityAuthority,
  reduceReviewApplicabilityAuthorityWithMechanicalCarry,
  reviewApplicabilityConsumerAction,
  type ReviewApplicabilityConsumerAction,
} from "./review-applicability-authority.js";
import {
  currentApprovedDispositionNode,
  type ApprovedDispositionLineageNode,
  type ApprovedDispositionRecord,
} from "../core/advisory-records.js";
import type {
  ReviewContributionApplicabilityResult,
} from "./review-contribution-applicability.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../core/review-source-reference.js";
import type { HostedFindingsResponsePlan } from "../core/response-plan-schema.js";
import { projectHostedFinding } from "../hosted/await.js";

export type EarlierHostedAttemptApplicabilityRead =
  | {
    readonly status: "complete";
    readonly attempts: readonly {
      readonly operationId: string;
      readonly attemptId: string;
      readonly attemptIndex?: number;
      readonly logicalPass: number;
      readonly updatedAt: string;
      readonly sourceId: string;
      readonly outcome: string;
      readonly requestedCoverage: "complete" | "incremental";
      readonly effectiveCoverage: "complete" | "incremental" | null;
      readonly scopeMode: "whole-target" | "chunked";
      readonly chunkSeriesComplete?: boolean;
      readonly producerTarget?: EarlierReviewAttemptCandidate["reviewTarget"];
      readonly hosted?: EarlierReviewAttemptCandidate["hosted"];
      readonly applicability: ReviewApplicabilityConsumerAction;
      readonly retentionBasis?: "verified-fix-response";
      readonly projection?: ReviewContributionApplicabilityResult;
      readonly authorityState?: "decision-required" | "blocked";
      readonly responsePlan?: HostedFindingsResponsePlan;
      readonly localResumeAction?: { readonly schemaVersion: 1; readonly operationId: string };
    }[];
  }
  | { readonly status: "not-found" }
  | { readonly status: "unavailable"; readonly detail: string };

/** Outcomes whose applicable prior attempt already decides settlement or source fallback. */
export function earlierAttemptRetainsReservationPosition(outcome: string): boolean {
  return outcome === "clean"
    || outcome === "findings"
    || outcome === "settled-findings"
    || outcome === "rate-limited"
    || outcome === "transient-unavailable";
}

export interface EarlierReviewApplicabilityInput {
  readonly query: EarlierReviewAttemptQuery;
  readonly currentBase: string;
  readonly snapshot: ReviewOperationStateSnapshot;
  readonly candidate: CandidateManagedRecordV1;
  readonly exec: RawGitExec;
  readonly observeEndpoints: (
    selector: Parameters<typeof projectGitReviewContributionApplicability>[0]["selector"],
  ) => Promise<{ readonly head: string; readonly base: string }>;
  readonly readDispositionRecord?: (attemptId: string) => Promise<ApprovedDispositionRecord | null>;
  readonly projectApplicability?: (
    selector: Parameters<typeof projectGitReviewContributionApplicability>[0]["selector"],
  ) => Promise<ReviewContributionApplicabilityResult>;
}

function verifiedDeliveryMemberFixResponse(input: {
  readonly record: ApprovedDispositionRecord | null;
  readonly candidate: EarlierReviewAttemptCandidate;
  readonly query: EarlierReviewAttemptQuery;
}): NonNullable<ApprovedDispositionLineageNode["deliveryMemberFixResponse"]> | null {
  const { record, candidate, query } = input;
  const priorVehicle = candidate.priorVehicle;
  const currentVehicle = query.currentVehicle;
  const response = record === null ? null : currentApprovedDispositionNode(record).deliveryMemberFixResponse;
  if (candidate.outcome !== "settled-findings"
    || record?.operationId !== candidate.attemptId
    || record.source.kind === "frontline"
    || record.deliveryMember === null
    || priorVehicle === undefined
    || currentVehicle === undefined
    || response === null) return null;
  let sourceReference;
  try {
    sourceReference = record.source.kind === "hosted"
      ? parseReviewSourceReference(record.source.attemptRef, "hosted")
      : parseReviewSourceReference(record.source.receiptRef, "attested-local");
  } catch {
    return null;
  }
  const sourceMatches = candidate.sourceKind === "hosted"
    ? record.source.kind === "hosted"
      && response.hostedTarget !== null
      && response.hostedFixTarget !== null
      && sourceReference.operationId === candidate.operationId
      && sourceReference.durableRef === candidate.attemptId
      && response.hostedTarget.repository.toLowerCase() === candidate.target.repository.toLowerCase()
      && response.hostedTarget.pullRequest === candidate.target.pullRequest
      && response.hostedTarget.headSha === candidate.priorHead
      && response.hostedFixTarget.repository.toLowerCase() === query.repository
      && response.hostedFixTarget.pullRequest === query.pullRequest
    : record.source.kind === "attested-local"
      && response.hostedTarget === null
      && response.hostedFixTarget === null
      && sourceReference.operationId === candidate.attemptId;
  return sourceMatches
    && sameDeliveryReviewMemberVehicle(record.deliveryMember, priorVehicle)
    && currentVehicle.planId === priorVehicle.planId
    && currentVehicle.deliverableId === priorVehicle.deliverableId
    && currentVehicle.workUnitId === priorVehicle.workUnitId
    && response.oldTarget.targetId === candidate.reviewTarget.targetId
    && response.newTarget.kind === "delivery-member"
    && response.newTarget.repositoryId === query.repositoryId
      ? response
      : null;
}

/** Whether canonical authority proves that this exact current query must still find its prior attempt. */
export function candidateExpectsEarlierReviewAttempt(
  candidate: CandidateManagedRecordV1,
  query: EarlierReviewAttemptQuery,
): boolean {
  return candidateReviewApplicabilitySelections(candidate).some((selection) => (
    selection.selector.repositoryId === query.repositoryId
    && selection.selector.repository === query.repository.toLowerCase()
    && selection.selector.pullRequest === query.pullRequest
    && selection.selector.currentHead === query.currentHead
    && selection.selector.lane === query.lane
    && selection.selector.sourceId === query.sourceId
    && sameDeliveryReviewMemberVehicle(selection.selector.currentVehicle, query.currentVehicle)
  ));
}

/** Project every exact earlier candidate without reading or writing authority outside the Candidate. */
export async function projectEarlierReviewApplicability(
  input: EarlierReviewApplicabilityInput,
): Promise<EarlierHostedAttemptApplicabilityRead> {
  const query = EarlierReviewAttemptQuerySchema.parse(input.query);
  const queried = queryEarlierReviewAttempts(query, input.snapshot);
  if (queried.status === "unavailable") {
    if (queried.reason === "no-matching-attempt") return { status: "not-found" };
    return { status: "unavailable", detail: queried.detail };
  }
  const selections = candidateReviewApplicabilitySelections(input.candidate);
  const ownRecord = gitCandidateRecordAtHead(input.exec, input.candidate.attestation.workUnit);
  const attempts = await Promise.all(queried.candidates.map(async (candidate) => {
    const dispositionRecord = candidate.outcome === "settled-findings"
      && input.readDispositionRecord !== undefined
      ? await input.readDispositionRecord(candidate.attemptId)
      : null;
    const fixResponse = verifiedDeliveryMemberFixResponse({
      record: dispositionRecord,
      candidate,
      query,
    });
    const retainedByFixResponse = fixResponse !== null
      && fixResponse.newTarget.diffBaseSha === input.currentBase
      && fixResponse.newTarget.headSha === query.currentHead
      && (fixResponse.hostedFixTarget === null
        || fixResponse.hostedFixTarget.headSha === query.currentHead);
    const priorHead = fixResponse?.newTarget.headSha ?? candidate.priorHead;
    const priorBase = fixResponse?.newTarget.diffBaseSha ?? candidate.reviewTarget.diffBaseSha;
    const priorVehicle = fixResponse === null || candidate.priorVehicle === undefined
      ? candidate.priorVehicle
      : { ...candidate.priorVehicle, head: fixResponse.newTarget.headSha };
    const selector = {
      schemaVersion: 1 as const,
      repositoryId: query.repositoryId,
      repository: query.repository,
      pullRequest: query.pullRequest,
      lane: "standard" as const,
      sourceId: candidate.sourceId,
      priorAttemptId: candidate.attemptId,
      priorHead,
      currentHead: query.currentHead,
      priorBase,
      currentBase: input.currentBase,
      ...(priorVehicle === undefined
        ? {}
        : { priorVehicle, currentVehicle: query.currentVehicle }),
    };
    const projection = retainedByFixResponse
      ? undefined
      : input.projectApplicability === undefined
      ? await projectGitReviewContributionApplicability({
          selector,
          exec: input.exec,
          observeEndpoints: () => input.observeEndpoints(selector),
        })
      : await input.projectApplicability(selector);
    const projectSelector = (value: typeof selector) => input.projectApplicability === undefined
      ? projectGitReviewContributionApplicability({
          selector: value,
          exec: input.exec,
          observeEndpoints: async () => {
            const observed = await input.observeEndpoints(selector);
            // The A→B decision is historical. Check live C for movement before and
            // after each Git read, then prove the pinned historical endpoint.
            if (observed.head !== selector.currentHead || observed.base !== selector.currentBase) {
              throw new Error("The hosted review target moved during historical contribution proof.");
            }
            return { head: value.currentHead, base: value.currentBase };
          },
        })
      : input.projectApplicability(value);
    const carried = projection?.state !== "decision-required"
      ? []
      : await projectMechanicalReviewApplicabilityCarry({
          candidateId: input.candidate.attestation.candidateId,
          projection,
          selections,
          projectSelector,
          ownRecord,
        });
    const authority = projection === undefined
      ? null
      : carried.length === 0
        ? reduceReviewApplicabilityAuthority(
            input.candidate.attestation.candidateId,
            projection,
            selections,
          )
        : reduceReviewApplicabilityAuthorityWithMechanicalCarry(
            input.candidate.attestation.candidateId,
            projection,
            selections,
            carried,
          );
    return {
      operationId: candidate.operationId,
      attemptId: candidate.attemptId,
      attemptIndex: candidate.attemptIndex,
      logicalPass: candidate.logicalPass,
      updatedAt: candidate.updatedAt,
      sourceId: candidate.sourceId,
      outcome: candidate.outcome,
      requestedCoverage: candidate.requestedCoverage,
      effectiveCoverage: candidate.effectiveCoverage,
      scopeMode: candidate.scopeMode,
      ...(candidate.chunkSeriesComplete === undefined
        ? {}
        : { chunkSeriesComplete: candidate.chunkSeriesComplete }),
      producerTarget: candidate.reviewTarget,
      ...(candidate.hosted === undefined ? {} : { hosted: candidate.hosted }),
      applicability: authority === null
        ? "retain-prior-attempt" as const
        : reviewApplicabilityConsumerAction(authority),
      ...(retainedByFixResponse ? { retentionBasis: "verified-fix-response" as const } : {}),
      ...(authority === null ? {} : { projection: authority.projection }),
      ...(candidate.outcome !== "findings" || candidate.findings.length === 0
        ? {}
        : {
            responsePlan: {
              schemaVersion: 1 as const,
              target: candidate.reviewTarget,
              source: {
                kind: "hosted" as const,
                attemptRef: bindReviewSourceReference({
                  kind: "hosted",
                  operationId: candidate.operationId,
                  durableRef: candidate.attemptId,
                }),
              },
              findings: candidate.findings.map(projectHostedFinding),
            },
          }),
      ...(candidate.sourceKind === "local" && candidate.outcome === "findings"
        ? { localResumeAction: { schemaVersion: 1 as const, operationId: candidate.attemptId } }
        : {}),
      ...(authority !== null && (authority.state === "decision-required" || authority.state === "blocked")
        ? { authorityState: authority.state }
        : {}),
    };
  }));
  return { status: "complete", attempts };
}
