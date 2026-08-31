/** Pure projection of one selector-free delivery review-fix continuation step. */

import type { DeliveryEntryInspectionResult } from "./entry-inspection.js";
import type { DeliveryReviewFixRouteResult } from "./review-fix.js";
import type { DeliveryRevisionedRecord } from "./ports.js";
import type { DeliveryStateV1 } from "./schema.js";
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
  return {
    status: "selected",
    planId: selected.deliveryMember.planId,
    selectedDeliverableId: selected.deliveryMember.deliverableId,
    reviewedHead: selected.deliveryMember.head,
  };
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

/** Facts that are needed only by the entry route that consumes them. */
export interface DeliveryReviewFixContinuationProjectionInput {
  readonly request: DeliveryReviewFixContinueRequest;
  readonly entry: DeliveryEntryInspectionResult;
  readonly state?: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly route?: DeliveryReviewFixRouteResult;
  readonly activeBranch?: string;
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
          scope: { kind: "dependent-suffix" as const, selectedDeliverableId },
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
          scope: { kind: "dependent-suffix" as const, selectedDeliverableId },
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
    const route = input.route;
    if (route === undefined || route.status === "refused") {
      return route ?? { status: "refused" as const, reason: "review-fix-route-unavailable" };
    }
    if (route.selectedDeliverableId !== entry.selectedDeliverableId) {
      return { status: "refused" as const, reason: "review-fix-route-mismatch" };
    }
    if (route.route === "terminal-authoring") {
      return {
        status: "authoring-required" as const,
        route: "terminal-authoring" as const,
        selectedDeliverableId: route.selectedDeliverableId,
        nextAction: "author-terminal" as const,
        resumeAction: resumeAction(request),
        recommendedActionText: route.recommendedActionText,
      };
    }
    if (route.route === "terminal-rebind") {
      return dispatch({
        kind: "delivery-reconcile" as const,
        argv: ["arc", "delivery", "reconcile", "-", "--json"] as const,
        input: route.reconcileInput,
      }, "Rebind the exact terminal publication, then invoke this continuation again.");
    }
    if (route.route === "provider-refresh") {
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
      status: "authority-required" as const,
      authority: "candidate-renewal" as const,
      nextAction: "dispatch-authority-action" as const,
      action: { kind: "candidate-renewal" as const, argv: entry.attestationAction.argv },
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
  if (entry.status === "refused") return entry;
  return {
    status: "idle" as const,
    nextAction: "continue-work-unit" as const,
    recommendedActionText: "No delivery review-fix continuation is currently actionable.",
  };
}
