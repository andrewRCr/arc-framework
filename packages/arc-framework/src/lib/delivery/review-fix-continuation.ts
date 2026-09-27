/** Pure projection of one selector-free delivery review-fix continuation step. */

import type { DeliveryEntryInspectionResult } from "./entry-inspection.js";
import type { DeliveryReviewFixRouteResult } from "./review-fix.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import type { DeliveryStateV1 } from "./schema.js";
import {
  findExactPendingSelectedRefresh,
  hasExactPendingSelectedRefresh,
} from "./suffix-reconciliation.js";
import {
  canonicalDigest,
  canonicalize,
  sortByCanonicalBytes,
} from "../kernel/index.js";
import type { CandidateVerificationApplicability } from
  "../work-unit/candidate-attestation.js";
import {
  currentApprovedDispositionNode,
  type ApprovedDispositionLineageNode,
  type ApprovedDispositionRecord,
} from "../../scripts/review-gate/core/advisory-records.js";
import type { HostedFindingsResponsePlan, ReviewResponseSettlementRequest } from
  "../../scripts/review-gate/core/response-plan-schema.js";
import { validateFixAuthorization } from
  "../../scripts/review-gate/core/fix-authorization.js";

type PendingDeliveryReviewFixAuthority =
  | { readonly status: "none" }
  | {
      readonly status: "selected";
      readonly planId: string;
      readonly workUnitId: string;
      readonly selectedDeliverableId: string;
      readonly reviewedHead: string;
      readonly fixAuthorizationId: string;
      readonly dispositionSetId: string;
      readonly authorizedFindingIds: readonly string[];
      readonly authorizedFindingLoci: readonly string[];
      readonly approvedVerification:
        NonNullable<ApprovedDispositionLineageNode["fixAuthorization"]>["approvedVerification"];
      readonly operationId: string;
      readonly repositoryId: string;
      readonly source: ApprovedDispositionRecord["source"];
    }
  | {
      readonly status: "refused";
      readonly reason: "review-fix-response-ambiguous" | "review-fix-response-invalid";
    };

export type DurableDeliveryReviewFixResponseReplay =
  | { readonly status: "none" }
  | {
      readonly status: "selected";
      readonly planId: string;
      readonly selectedDeliverableId: string;
      readonly workUnitId: string;
      readonly operationId: string;
      readonly repositoryId: string;
      readonly currentTarget:
        NonNullable<ApprovedDispositionLineageNode["deliveryMemberFixResponse"]>["newTarget"];
      readonly hostedFixTarget:
        NonNullable<NonNullable<
          ApprovedDispositionLineageNode["deliveryMemberFixResponse"]
        >["hostedFixTarget"]>;
      readonly request: {
        readonly schemaVersion: 1;
        readonly source: Extract<ReviewResponseSettlementRequest["source"], { readonly kind: "hosted" }>;
        readonly policyRequest: ApprovedDispositionLineageNode["responsePolicyRequest"];
        readonly dispositions: ApprovedDispositionLineageNode["approvedDisposition"];
        readonly verifiedFix: {
          readonly applicability:
            NonNullable<ApprovedDispositionLineageNode["deliveryMemberFixResponse"]>["applicability"];
          readonly verificationEvidenceRefs: readonly string[];
        };
      };
    }
  | {
      readonly status: "refused";
      readonly reason: "review-fix-response-replay-ambiguous" | "review-fix-response-replay-invalid";
    };

export type DurableLocalDeliveryReviewFixAcknowledgementReplay =
  | { readonly status: "none" }
  | {
      readonly status: "settlement-only";
      readonly operationId: string;
    }
  | {
      readonly status: "selected";
      readonly operationId: string;
      readonly verification: VerificationResult;
    }
  | {
      readonly status: "refused";
      readonly reason:
        | "review-fix-acknowledgement-replay-ambiguous"
        | "review-fix-acknowledgement-replay-invalid";
    };

function recordMatchesDurableDeliveryResponseReplay(
  record: ApprovedDispositionRecord,
  responsePlan: HostedFindingsResponsePlan,
): boolean {
  const member = record.deliveryMember;
  const current = currentApprovedDispositionNode(record);
  const response = current.deliveryMemberFixResponse;
  if (member === null || response === null || record.source.kind !== "hosted"
    || response.hostedTarget === null || response.hostedFixTarget === null) return false;
  const responseFindingIds = sortByCanonicalBytes(responsePlan.findings.map(({ findingId }) => findingId));
  const dispositionFindingIds = sortByCanonicalBytes(
    current.approvedDisposition.dispositionSet.findings.map(({ findingId }) => findingId),
  );
  return record.repositoryId === responsePlan.target.repositoryId
    && record.source.attemptRef === responsePlan.source.attemptRef
    && current.approvedDisposition.dispositionSet.targetId === responsePlan.target.targetId
    && member.head === responsePlan.target.headSha
    && canonicalize(response.oldTarget) === canonicalize(responsePlan.target)
    && response.hostedTarget.headSha === responsePlan.target.headSha
    && canonicalize(responseFindingIds) === canonicalize(dispositionFindingIds);
}

/**
 * Recover one exact durable delivery-member response for a rediscovered hosted findings attempt.
 *
 * The returned request replays the already-approved disposition and the exact verification evidence
 * stored by its completed response. It never recreates either judgment or infers a new response from
 * finding similarity.
 */
export function selectDurableDeliveryReviewFixResponseReplay(input: {
  readonly workUnitId: string;
  readonly responsePlan: HostedFindingsResponsePlan;
  readonly records: readonly ApprovedDispositionRecord[];
}): DurableDeliveryReviewFixResponseReplay {
  const candidates = input.records.filter((record) => (
    record.deliveryMember?.workUnitId === input.workUnitId
    && currentApprovedDispositionNode(record).deliveryMemberFixResponse !== null
    && record.source.kind === "hosted"
    && record.source.attemptRef === input.responsePlan.source.attemptRef
  ));
  if (candidates.length > 1) {
    return { status: "refused", reason: "review-fix-response-replay-ambiguous" };
  }
  const selected = candidates[0];
  if (selected === undefined) return { status: "none" };
  const current = currentApprovedDispositionNode(selected);
  if (!recordMatchesDurableDeliveryResponseReplay(selected, input.responsePlan)
    || selected.deliveryMember === null || current.deliveryMemberFixResponse === null
    || current.deliveryMemberFixResponse.hostedFixTarget === null
    || selected.source.kind !== "hosted") {
    return { status: "refused", reason: "review-fix-response-replay-invalid" };
  }
  return {
    status: "selected",
    planId: selected.deliveryMember.planId,
    selectedDeliverableId: selected.deliveryMember.deliverableId,
    workUnitId: selected.deliveryMember.workUnitId,
    operationId: selected.operationId,
    repositoryId: selected.repositoryId,
    currentTarget: current.deliveryMemberFixResponse.newTarget,
    hostedFixTarget: current.deliveryMemberFixResponse.hostedFixTarget,
    request: {
      schemaVersion: 1,
      source: { kind: "hosted", attemptRef: selected.source.attemptRef },
      policyRequest: current.responsePolicyRequest,
      dispositions: current.approvedDisposition,
      verifiedFix: {
        applicability: current.deliveryMemberFixResponse.applicability,
        verificationEvidenceRefs: current.deliveryMemberFixResponse.fixConsumption.verificationRefs,
      },
    },
  };
}

/**
 * Recover exact verification or settlement from a durable local response written before acknowledgement finished.
 *
 * @param input - Pending member target and durable disposition records.
 * @returns Exact reusable verification, settlement-only authority, no match, or a typed ambiguity/refusal.
 */
export function selectDurableLocalDeliveryReviewFixAcknowledgementReplay(input: {
  readonly workUnitId: string;
  readonly planId: string;
  readonly selectedDeliverableId: string;
  readonly selectedMemberTarget: { readonly head: string; readonly tree: string };
  readonly target: { readonly head: string; readonly tree: string };
  readonly records: readonly ApprovedDispositionRecord[];
}): DurableLocalDeliveryReviewFixAcknowledgementReplay {
  const candidates = input.records.filter((record) => {
    const response = currentApprovedDispositionNode(record).deliveryMemberFixResponse;
    return record.deliveryMember?.workUnitId === input.workUnitId
      && record.deliveryMember.planId === input.planId
      && record.deliveryMember.deliverableId === input.selectedDeliverableId
      && record.source.kind === "attested-local"
      && response !== null
      && response.newTarget.kind === "delivery-member"
      && response.newTarget.headSha === input.selectedMemberTarget.head
      && response.newTarget.headTree === input.selectedMemberTarget.tree;
  });
  if (candidates.length > 1) {
    return { status: "refused", reason: "review-fix-acknowledgement-replay-ambiguous" };
  }
  const selected = candidates[0];
  if (selected === undefined) return { status: "none" };
  const response = currentApprovedDispositionNode(selected).deliveryMemberFixResponse;
  if (response === null || selected.source.kind !== "attested-local"
    || response.hostedTarget !== null || response.hostedFixTarget !== null
    || response.fixConsumption.verificationRefs.length === 0) {
    return { status: "refused", reason: "review-fix-acknowledgement-replay-invalid" };
  }
  if (input.target.head !== response.newTarget.headSha
    || input.target.tree !== response.newTarget.headTree) {
    return { status: "settlement-only", operationId: selected.operationId };
  }
  return {
    status: "selected",
    operationId: selected.operationId,
    verification: {
      applicability: response.applicability,
      target: input.target,
      tier1: {
        outcome: "passed",
        provenance: "exact-tree-reuse",
        targetTree: input.target.tree,
        coveredInputs: "unchanged",
      },
      verificationEvidenceRefs: response.fixConsumption.verificationRefs,
    },
  };
}

function recordHasExactPendingDeliveryFixAuthority(record: ApprovedDispositionRecord): boolean {
  const member = record.deliveryMember;
  const current = currentApprovedDispositionNode(record);
  const authorization = current.fixAuthorization;
  if (member === null || authorization === null || record.source.kind === "frontline") return false;
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
    && authorization.dispositionSetId
      === current.approvedDisposition.dispositionSet.dispositionSetId
    && authorization.approvedVerification
      === current.approvedDisposition.dispositionSet.proposedVerification
    && authorization.oldTargetId === current.approvedDisposition.dispositionSet.targetId
    && authorization.oldHeadSha === member.head;
}

/**
 * Select pending delivery-member response authority for one active work unit.
 *
 * @param input - Active work-unit identity and the readable approved-disposition snapshot.
 * @returns The exact member selection, a typed refusal, or absence of pending response authority.
 */
export function selectPendingDeliveryReviewFixAuthority(input: {
  readonly workUnitId: string;
  readonly records: readonly ApprovedDispositionRecord[];
}): PendingDeliveryReviewFixAuthority {
  const pending = input.records.filter((record) => record.candidate === null
    && record.deliveryMember?.workUnitId === input.workUnitId
    && currentApprovedDispositionNode(record).fixAuthorization !== null
    && currentApprovedDispositionNode(record).deliveryMemberFixResponse === null);
  if (pending.some((record) => !recordHasExactPendingDeliveryFixAuthority(record))) {
    return { status: "refused", reason: "review-fix-response-invalid" };
  }
  if (pending.length > 1) return { status: "refused", reason: "review-fix-response-ambiguous" };
  const selected = pending[0];
  if (selected?.deliveryMember === null || selected?.deliveryMember === undefined) return { status: "none" };
  const current = currentApprovedDispositionNode(selected);
  if (current.fixAuthorization === null) {
    return { status: "refused", reason: "review-fix-response-invalid" };
  }
  return {
    status: "selected",
    planId: selected.deliveryMember.planId,
    workUnitId: selected.deliveryMember.workUnitId,
    selectedDeliverableId: selected.deliveryMember.deliverableId,
    reviewedHead: selected.deliveryMember.head,
    fixAuthorizationId: current.fixAuthorization.fixAuthorizationId,
    dispositionSetId: current.fixAuthorization.dispositionSetId,
    authorizedFindingIds: current.fixAuthorization.authorizedFindingIds,
    authorizedFindingLoci: current.approvedDisposition.dispositionSet.findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ locus }) => locus),
    approvedVerification: current.fixAuthorization.approvedVerification,
    operationId: selected.operationId,
    repositoryId: selected.repositoryId,
    source: selected.source,
  };
}

/**
 * Check whether one approved response still names the current correction position.
 *
 * @param input - Selected member, reviewed head, and current canonical delivery state.
 * @returns True for the reviewed head itself or its exact published-but-unrefreshed chain break.
 */
export function pendingDeliveryReviewFixAuthorityIsCurrent(input: {
  readonly selectedDeliverableId: string;
  readonly reviewedHead: string;
  readonly state: DeliveryStateV1;
}): boolean {
  const selectedIndex = input.state.members.findIndex(
    ({ deliverableId }) => deliverableId === input.selectedDeliverableId,
  );
  if (selectedIndex < 0) return false;
  const selected = input.state.members[selectedIndex];
  if (selected?.coordinates?.head === input.reviewedHead) return true;
  const dependent = input.state.members[selectedIndex + 1];
  return dependent?.coordinates?.base === input.reviewedHead
    && hasExactPendingSelectedRefresh(input.state, input.selectedDeliverableId);
}

/**
 * Check whether mechanically preserved response authority may resume from an integration entry.
 *
 * @param status - Fresh integrating-entry status after exact contribution applicability succeeds.
 * @returns True when the entry remains on the retained public-review continuation.
 */
export function pendingDeliveryReviewFixCanResumeFromIntegrationStatus(
  status: DeliveryEntryInspectionResult["status"],
): boolean {
  return status === "candidate-renewal-required"
    || status === "candidate-verification-required"
    || status === "correction-routing-required"
    || status === "resolve-delivery-status";
}

type VerificationResult = {
  readonly applicability: "targeted" | "focused" | "full";
  readonly target: { readonly head: string; readonly tree: string };
  readonly tier1:
    | {
        readonly outcome: "passed";
        readonly provenance: "rerun";
        readonly targetTree: string;
      }
    | {
        readonly outcome: "passed";
        readonly provenance: "exact-tree-reuse";
        readonly targetTree: string;
        readonly coveredInputs: "unchanged";
      };
  readonly verificationEvidenceRefs: readonly string[];
};

/** Stable caller input; every mutable selector is derived from canonical repository state. */
export interface DeliveryReviewFixContinueRequest {
  readonly repository: string;
  readonly remote: string;
  readonly verification?: VerificationResult;
}

export interface DeliveryReviewFixAuthoringObservation {
  readonly locus: {
    readonly kind: "candidate" | "top";
    readonly ref: string;
    readonly checkoutPath: string;
  };
  readonly publishedHead: string;
  readonly observed: {
    readonly head: string;
    readonly tree: string;
    readonly trackedDirty: boolean;
  } | null;
  readonly refCoordinates?: {
    readonly head: string;
    readonly tree: string;
  } | null;
  readonly authoredPaths?: readonly string[];
  readonly requiredFindingPaths?: readonly string[];
  readonly requiredAncestorHeads: readonly string[];
  readonly ancestry: readonly {
    readonly ancestor: string;
    readonly status: "ancestor" | "not-ancestor" | "unresolvable";
  }[];
}

export type DeliveryReviewFixAuthoringReadiness =
  | ({ readonly status: "authoring-required" } & DeliveryReviewFixAuthoringObservation["locus"])
  | ({ readonly status: "ready"; readonly head: string; readonly tree: string }
      & DeliveryReviewFixAuthoringObservation["locus"])
  | { readonly status: "refused"; readonly reason: string };

/** Classify whether an exact correction authoring locus is ready for its route mutation. */
export function classifyDeliveryReviewFixAuthoringReadiness(
  input: DeliveryReviewFixAuthoringObservation,
): DeliveryReviewFixAuthoringReadiness {
  if (input.observed !== null && input.refCoordinates !== undefined
    && (input.refCoordinates === null
      || input.observed.head !== input.refCoordinates.head
      || input.observed.tree !== input.refCoordinates.tree)) {
    return { status: "refused", reason: "authoring-locus-moved" };
  }
  if (input.observed?.trackedDirty === true) {
    return { status: "refused", reason: "authoring-locus-dirty" };
  }
  if (input.observed === null || input.observed.head === input.publishedHead) {
    return { status: "authoring-required", ...input.locus };
  }
  if (input.requiredFindingPaths !== undefined && input.requiredFindingPaths.length > 0
    && input.authoredPaths !== undefined
    && !input.requiredFindingPaths.some((path) => input.authoredPaths?.includes(path))) {
    return { status: "authoring-required", ...input.locus };
  }
  for (const required of input.requiredAncestorHeads) {
    const matches = input.ancestry.filter(({ ancestor }) => ancestor === required);
    if (matches.length !== 1) {
      return { status: "refused", reason: "authoring-ancestry-unavailable" };
    }
    if (matches[0]?.status === "not-ancestor") {
      return { status: "authoring-required", ...input.locus };
    }
    if (matches[0]?.status !== "ancestor") {
      return { status: "refused", reason: "authoring-ancestry-unavailable" };
    }
  }
  return {
    status: "ready",
    ...input.locus,
    head: input.observed.head,
    tree: input.observed.tree,
  };
}

/** Facts that are needed only by the entry route that consumes them. */
export interface DeliveryReviewFixContinuationProjectionInput {
  readonly request: DeliveryReviewFixContinueRequest;
  readonly entry: DeliveryEntryInspectionResult;
  readonly state?: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly landedDeliverableIds?: readonly string[];
  readonly route?: DeliveryReviewFixRouteResult;
  readonly activeBranch?: string;
  readonly authoring?: DeliveryReviewFixAuthoringReadiness;
  readonly approvedDispositionSet?: {
    readonly dispositionSetId: string;
    readonly authorizedFindingIds: readonly string[];
    readonly authorizedFindingLoci?: readonly string[];
  };
  readonly approvedFix?: {
    readonly fixAuthorizationId: string;
    readonly workUnitId: string;
    readonly reviewedHead: string;
    readonly approvedVerification: CandidateVerificationApplicability;
  };
}

function resumeAction(request: DeliveryReviewFixContinueRequest) {
  return {
    argv: ["arc", "delivery", "review-fix", "continue", "-"] as const,
    input: { repository: request.repository, remote: request.remote },
  };
}

function dispatch(action: object, recommendedActionText: string) {
  return { status: "dispatch" as const, nextAction: "dispatch" as const, action, recommendedActionText };
}

function projectPendingSelectedRefresh(input: {
  readonly request: DeliveryReviewFixContinueRequest;
  readonly planId: string;
  readonly selectedDeliverableId: string;
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
}) {
  const operation = input.state.value.activeOperation;
  if (operation !== null && (operation.kind !== "rewrite"
    || operation.mode !== "provider-refresh"
    || operation.reviewFixSelectedDeliverableId !== input.selectedDeliverableId)) {
    return { status: "refused" as const, reason: "review-fix-operation-mismatch" };
  }
  return dispatch({
    kind: "delivery-refresh-execute" as const,
    argv: ["arc", "delivery", "refresh", "execute", "-"] as const,
    input: {
      planId: input.planId,
      repository: input.request.repository,
      remote: input.request.remote,
      ...(operation === null
        ? {
            scope: {
              kind: "dependent-suffix" as const,
              selectedDeliverableId: input.selectedDeliverableId,
            },
          }
        : { operationId: operation.operationId }),
    },
  }, "Execute the exact provider refresh, then invoke this continuation again.");
}

/**
 * Project the next exact machine action or existing authority stop from canonical facts.
 * The projector mutates nothing and never accepts a member, operation, revision, or digest selector from its caller.
 */
export function projectDeliveryReviewFixContinuation(input: DeliveryReviewFixContinuationProjectionInput) {
  const { entry, request } = input;
  if (entry.status === "review-fix-verification-required") {
    if (request.verification === undefined) {
      return {
        status: "verification-required" as const,
        nextAction: "verify-review-fix" as const,
        selectedDeliverableId: entry.selectedDeliverableId,
        verification: entry.verification,
        resumeAction: resumeAction(request),
        recommendedActionText: entry.recommendedActionText,
      };
    }
    if (request.verification.target.head !== entry.verification.target.head
      || request.verification.target.tree !== entry.verification.target.tree
      || request.verification.tier1.targetTree !== entry.verification.target.tree) {
      return { status: "refused" as const, reason: "verification-target-mismatch" };
    }
    return dispatch({
      kind: "delivery-review-fix-acknowledge" as const,
      argv: ["arc", "delivery", "review-fix", "acknowledge", "-"] as const,
      input: { ...entry.acknowledgementInput, verification: request.verification },
    }, "Acknowledge the exact scoped verification, then invoke this continuation again.");
  }
  if (request.verification !== undefined) {
    return { status: "refused" as const, reason: "verification-continuation-not-pending" };
  }

  if ((entry.status === "candidate-verification-required" || entry.status === "correction-routing-required")
    && input.state !== undefined) {
    const selectedDeliverableId = findExactPendingSelectedRefresh(
      input.state.value,
      input.landedDeliverableIds,
    );
    if (selectedDeliverableId !== null) {
      return projectPendingSelectedRefresh({
        request,
        planId: entry.planId,
        selectedDeliverableId,
        state: input.state,
      });
    }
  }

  if (entry.status === "resume-bound") {
    const operation = input.state?.value.activeOperation ?? null;
    if (operation?.kind !== "rewrite"
      || !["review-fix", "selected-change", "provider-refresh", "provider-adoption"].includes(operation.mode)) {
      return { status: "refused" as const, reason: "review-fix-operation-unavailable" };
    }
    const selectedDeliverableId = operation.reviewFixSelectedDeliverableId;
    if (operation.mode === "provider-refresh") {
      if (selectedDeliverableId === undefined) {
        return { status: "refused" as const, reason: "review-fix-selector-unavailable" };
      }
      return dispatch({
        kind: "delivery-refresh-execute" as const,
        argv: ["arc", "delivery", "refresh", "execute", "-"] as const,
        input: {
          planId: entry.planId,
          repository: request.repository,
          remote: request.remote,
          operationId: operation.operationId,
        },
      }, "Resume the exact persisted provider refresh, then invoke this continuation again.");
    }
    if (operation.mode === "provider-adoption") {
      if (selectedDeliverableId === undefined) {
        return { status: "refused" as const, reason: "review-fix-selector-unavailable" };
      }
      return dispatch({
        kind: "delivery-refresh-adopt" as const,
        argv: ["arc", "delivery", "refresh", "adopt", "-"] as const,
        input: {
          planId: entry.planId,
          repository: request.repository,
          remote: request.remote,
          operationId: operation.operationId,
        },
      }, "Resume the exact persisted provider adoption, then invoke this continuation again.");
    }
    return dispatch({
      kind: "delivery-reconcile" as const,
      argv: ["arc", "delivery", "reconcile", "-"] as const,
      input: {
        planId: entry.planId,
        repository: request.repository,
        remote: request.remote,
        continuation: "read-position" as const,
        ...(selectedDeliverableId === undefined ? {} : { reviewFixSelectedDeliverableId: selectedDeliverableId }),
      },
    }, "Reconcile the exact persisted correction operation, then invoke this continuation again.");
  }

  if (entry.status === "correction-routing-required") {
    if (input.landedDeliverableIds?.includes(entry.selectedDeliverableId)) {
      return { status: "refused" as const, reason: "review-fix-route-mismatch" };
    }
    if (input.state !== undefined
      && hasExactPendingSelectedRefresh(input.state.value, entry.selectedDeliverableId)) {
      return projectPendingSelectedRefresh({
        request,
        planId: entry.planId,
        selectedDeliverableId: entry.selectedDeliverableId,
        state: input.state,
      });
    }
    const route = input.route;
    if (route === undefined || route.status === "refused") {
      return route ?? { status: "refused" as const, reason: "review-fix-route-unavailable" };
    }
    if (route.selectedDeliverableId !== entry.selectedDeliverableId) {
      return { status: "refused" as const, reason: "review-fix-route-mismatch" };
    }
    const authoringStop = () => {
      if (input.authoring?.status === "refused") return input.authoring;
      if (input.authoring?.status !== "authoring-required") {
        return { status: "refused" as const, reason: "review-fix-authoring-readiness-unavailable" };
      }
      const authoringAuthorization = input.approvedDispositionSet === undefined
        || input.approvedFix === undefined
        ? undefined
        : {
            fixAuthorizationId: input.approvedFix.fixAuthorizationId,
            dispositionSetId: input.approvedDispositionSet.dispositionSetId,
            planId: entry.planId,
            workUnitId: input.approvedFix.workUnitId,
            selectedDeliverableId: entry.selectedDeliverableId,
            reviewedHead: input.approvedFix.reviewedHead,
            approvedVerification: input.approvedFix.approvedVerification,
            ref: input.authoring.ref,
            checkoutPath: input.authoring.checkoutPath,
          };
      return {
        status: "authoring-required" as const,
        route: route.route,
        selectedDeliverableId: route.selectedDeliverableId,
        derivedFrom: entry.derivedFrom,
        nextAction: "author-correction" as const,
        authoring: {
          kind: input.authoring.kind,
          ref: input.authoring.ref,
          checkoutPath: input.authoring.checkoutPath,
        },
        requiredAncestorHeads: route.route === "provider-refresh"
          ? route.candidateRequirements.requiredAncestorHeads
          : [],
        ...(input.approvedDispositionSet === undefined
          ? {}
          : { approvedDispositionSet: input.approvedDispositionSet }),
        ...(authoringAuthorization === undefined ? {} : { authoringAuthorization }),
        resumeAction: resumeAction(request),
        recommendedActionText: route.recommendedActionText,
      };
    };
    if (route.route === "terminal-authoring") {
      if (input.authoring?.status === "ready") {
        return dispatch({
          kind: "delivery-reconcile" as const,
          argv: ["arc", "delivery", "reconcile", "-"] as const,
          input: {
            planId: entry.planId,
            repository: request.repository,
            remote: request.remote,
            continuation: "read-position" as const,
            reviewFixSelectedDeliverableId: entry.selectedDeliverableId,
          },
        }, "Rebind the exact terminal correction, then invoke this continuation again.");
      }
      return authoringStop();
    }
    if (route.route === "terminal-rebind") {
      return dispatch({
        kind: "delivery-reconcile" as const,
        argv: ["arc", "delivery", "reconcile", "-"] as const,
        input: route.reconcileInput,
      }, "Rebind the exact terminal publication, then invoke this continuation again.");
    }
    if (route.route === "provider-refresh") {
      if (input.state !== undefined
        && hasExactPendingSelectedRefresh(input.state.value, route.selectedDeliverableId)) {
        return projectPendingSelectedRefresh({
          request,
          planId: entry.planId,
          selectedDeliverableId: route.selectedDeliverableId,
          state: input.state,
        });
      }
      if (input.authoring?.status !== "ready") return authoringStop();
      return dispatch({
        kind: "delivery-review-fix-publish" as const,
        argv: ["arc", "delivery", "review-fix", "publish", "-"] as const,
        input: {
          planId: entry.planId,
          selectedDeliverableId: entry.selectedDeliverableId,
          repository: request.repository,
          remote: request.remote,
        },
      }, route.recommendedActionText);
    }
    const protectedBaseRef = input.state?.value.target?.ref ?? null;
    if (input.authoring?.status !== "ready") return authoringStop();
    if (protectedBaseRef === null || input.activeBranch === undefined) {
      return { status: "refused" as const, reason: "review-fix-rematerialization-unavailable" };
    }
    const pendingVerificationDerivation = entry.derivedFrom.kind === "pending-verification"
      ? entry.derivedFrom
      : null;
    const pendingVerification = pendingVerificationDerivation !== null
      ? input.state?.value.pendingReviewFixVerification ?? null
      : null;
    if (pendingVerificationDerivation !== null
      && (input.state === undefined
        || canonicalDigest(input.state.value) !== pendingVerificationDerivation.continuationDigest
        || pendingVerification === null
        || pendingVerification.selectedDeliverableId !== entry.selectedDeliverableId)) {
      return { status: "refused" as const, reason: "review-fix-rematerialization-unavailable" };
    }
    const pendingVerificationSupersession = pendingVerificationDerivation === null
      || pendingVerification === null
      ? null
      : {
          pendingVerification,
          expectedStateRevision: entry.stateRevision,
          continuationDigest: pendingVerificationDerivation.continuationDigest,
        };
    return dispatch({
      kind: "delivery-rematerialize" as const,
      argv: ["arc", "delivery", "rematerialize", "-"] as const,
      input: {
        planId: entry.planId,
        protectedBaseRef,
        topRef: `refs/heads/${input.activeBranch}`,
        selectedDeliverableIds: [entry.selectedDeliverableId],
        ...(pendingVerificationSupersession === null
          ? {}
          : {
              supersedePendingReviewFixVerification: pendingVerificationSupersession,
            }),
        repository: request.repository,
        remote: request.remote,
      },
    }, route.recommendedActionText);
  }

  if (entry.status === "candidate-renewal-required") {
    return {
      status: "boundary-carry-required" as const,
      planId: entry.planId,
      stateRevision: entry.stateRevision,
      candidateSubjectDigest: entry.candidateSubjectDigest,
      recommendedActionText: entry.recommendedActionText,
    };
  }
  if (entry.status === "continue-publication") {
    return {
      status: "authority-required" as const,
      authority: "publication" as const,
      nextAction: "dispatch-authority-action" as const,
      action: { kind: "publication" as const, action: entry.publicationAction },
      recommendedActionText: entry.recommendedActionText,
    };
  }
  if (entry.status === "resolve-delivery-status") {
    return {
      status: "authority-required" as const,
      authority: "delivery-status" as const,
      nextAction: "dispatch-authority-action" as const,
      action: { kind: "delivery-status" as const, action: entry.deliveryStatusAction },
      recommendedActionText: entry.recommendedActionText,
    };
  }
  if (entry.status === "candidate-verification-required") {
    return {
      status: entry.status,
      nextAction: entry.nextAction,
      planId: entry.planId,
      stateRevision: entry.stateRevision,
      recommendedActionText: entry.recommendedActionText,
    };
  }
  if (entry.status === "refused") return entry;
  return {
    status: "idle" as const,
    nextAction: "continue-work-unit" as const,
    recommendedActionText: "No delivery review-fix continuation is currently actionable.",
  };
}
