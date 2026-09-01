/** Pure projection of one selector-free delivery review-fix continuation step. */

import type { DeliveryEntryInspectionResult } from "./entry-inspection.js";
import type { DeliveryReviewFixRouteResult } from "./review-fix.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import type { DeliveryStateV1 } from "./schema.js";
import {
  findExactPendingSelectedRefresh,
  hasExactPendingSelectedRefresh,
} from "./suffix-reconciliation.js";
import { sortByCanonicalBytes } from "../kernel/index.js";
import type { ApprovedDispositionRecord } from
  "../../scripts/review-gate/core/advisory-records.js";
import { validateFixAuthorization } from
  "../../scripts/review-gate/core/fix-authorization.js";

type PendingDeliveryReviewFixAuthority =
  | { readonly status: "none" }
  | {
      readonly status: "selected";
      readonly planId: string;
      readonly selectedDeliverableId: string;
      readonly reviewedHead: string;
      readonly dispositionSetId: string;
      readonly authorizedFindingIds: readonly string[];
      readonly authorizedFindingLoci: readonly string[];
      readonly operationId: string;
      readonly repositoryId: string;
      readonly attemptRef: string;
    }
  | {
      readonly status: "refused";
      readonly reason: "review-fix-response-ambiguous" | "review-fix-response-invalid";
    };

function recordHasExactPendingDeliveryFixAuthority(record: ApprovedDispositionRecord): boolean {
  const member = record.deliveryMember;
  const authorization = record.fixAuthorization;
  if (member === null || authorization === null || record.source.kind !== "hosted") return false;
  try {
    validateFixAuthorization(authorization);
  } catch {
    return false;
  }
  const authorizedFindingIds = sortByCanonicalBytes(
    record.approvedDisposition.dispositionSet.findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ findingId }) => findingId),
  );
  return authorizedFindingIds.length > 0
    && JSON.stringify(authorization.authorizedFindingIds) === JSON.stringify(authorizedFindingIds)
    && authorization.dispositionSetId
      === record.approvedDisposition.dispositionSet.dispositionSetId
    && authorization.oldTargetId === record.approvedDisposition.dispositionSet.targetId
    && authorization.oldHeadSha === member.head;
}

/**
 * Select pending hosted delivery-member response authority for one active work unit.
 *
 * @param input - Active work-unit identity and the readable approved-disposition snapshot.
 * @returns The exact member selection, a typed refusal, or absence of pending response authority.
 */
export function selectPendingDeliveryReviewFixAuthority(input: {
  readonly workUnitId: string;
  readonly records: readonly ApprovedDispositionRecord[];
}): PendingDeliveryReviewFixAuthority {
  const pending = input.records.filter((record) => record.deliveryMember?.workUnitId === input.workUnitId
    && record.fixAuthorization !== null
    && record.deliveryMemberFixResponse === null);
  if (pending.some((record) => !recordHasExactPendingDeliveryFixAuthority(record))) {
    return { status: "refused", reason: "review-fix-response-invalid" };
  }
  if (pending.length > 1) return { status: "refused", reason: "review-fix-response-ambiguous" };
  const selected = pending[0];
  if (selected?.deliveryMember === null || selected?.deliveryMember === undefined) return { status: "none" };
  if (selected.fixAuthorization === null) {
    return { status: "refused", reason: "review-fix-response-invalid" };
  }
  return {
    status: "selected",
    planId: selected.deliveryMember.planId,
    selectedDeliverableId: selected.deliveryMember.deliverableId,
    reviewedHead: selected.deliveryMember.head,
    dispositionSetId: selected.fixAuthorization.dispositionSetId,
    authorizedFindingIds: selected.fixAuthorization.authorizedFindingIds,
    authorizedFindingLoci: selected.approvedDisposition.dispositionSet.findings
      .filter(({ disposition }) => disposition === "fix")
      .map(({ locus }) => locus),
    operationId: selected.operationId,
    repositoryId: selected.repositoryId,
    attemptRef: selected.source.kind === "hosted" ? selected.source.attemptRef : "",
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
    || status === "continue-hosted-review";
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
  readonly route?: DeliveryReviewFixRouteResult;
  readonly activeBranch?: string;
  readonly authoring?: DeliveryReviewFixAuthoringReadiness;
  readonly approvedDispositionSet?: {
    readonly dispositionSetId: string;
    readonly authorizedFindingIds: readonly string[];
    readonly authorizedFindingLoci?: readonly string[];
  };
}

function resumeAction(request: DeliveryReviewFixContinueRequest) {
  return {
    argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"] as const,
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
    argv: ["arc", "delivery", "refresh", "execute", "-", "--json"] as const,
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
        acknowledgementInput: entry.acknowledgementInput,
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
      argv: ["arc", "delivery", "review-fix", "acknowledge", "-", "--json"] as const,
      input: { ...entry.acknowledgementInput, verification: request.verification },
    }, "Acknowledge the exact scoped verification, then invoke this continuation again.");
  }
  if (request.verification !== undefined) {
    return { status: "refused" as const, reason: "verification-continuation-not-pending" };
  }

  if (entry.status === "candidate-verification-required" && input.state !== undefined) {
    const selectedDeliverableId = findExactPendingSelectedRefresh(input.state.value);
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
        argv: ["arc", "delivery", "refresh", "execute", "-", "--json"] as const,
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
        argv: ["arc", "delivery", "refresh", "adopt", "-", "--json"] as const,
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
      argv: ["arc", "delivery", "reconcile", "-", "--json"] as const,
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
      return {
        status: "authoring-required" as const,
        route: route.route,
        selectedDeliverableId: route.selectedDeliverableId,
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
        resumeAction: resumeAction(request),
        recommendedActionText: route.recommendedActionText,
      };
    };
    if (route.route === "terminal-authoring") {
      return input.authoring === undefined
        ? {
            status: "authoring-required" as const,
            route: "terminal-authoring" as const,
            selectedDeliverableId: route.selectedDeliverableId,
            nextAction: "author-terminal" as const,
            resumeAction: resumeAction(request),
            recommendedActionText: route.recommendedActionText,
          }
        : authoringStop();
    }
    if (route.route === "terminal-rebind") {
      return dispatch({
        kind: "delivery-reconcile" as const,
        argv: ["arc", "delivery", "reconcile", "-", "--json"] as const,
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
        argv: ["arc", "delivery", "review-fix", "publish", "-", "--json"] as const,
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
    return dispatch({
      kind: "delivery-rematerialize" as const,
      argv: ["arc", "delivery", "rematerialize", "-", "--json"] as const,
      input: {
        planId: entry.planId,
        protectedBaseRef,
        topRef: `refs/heads/${input.activeBranch}`,
        selectedDeliverableIds: [entry.selectedDeliverableId],
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
  if (entry.status === "continue-hosted-review") {
    return {
      status: "authority-required" as const,
      authority: "hosted-review" as const,
      nextAction: "dispatch-authority-action" as const,
      action: { kind: "hosted-review" as const, action: entry.hostedReviewAction },
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
