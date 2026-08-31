import { describe, expect, it } from "vitest";

import type { DeliveryEntryInspectionResult } from
  "../../../src/lib/delivery/entry-inspection.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { projectDeliveryReviewFixContinuation } from
  "../../../src/lib/delivery/review-fix-continuation.js";
import { projectDeliveryReviewFixVerificationContinuation } from
  "../../../src/lib/delivery/review-fix-verification.js";
import type { DeliveryReviewFixRouteResult } from "../../../src/lib/delivery/review-fix.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const request = { repository: "owner/repo", remote: "origin" } as const;
const selectedDeliverableId = plan.members[0]!.deliverableId;
const recommendedActionText = "Continue the exact correction.";

function correctionEntry(): DeliveryEntryInspectionResult {
  return {
    status: "correction-routing-required",
    nextAction: "plan-review-fix",
    planId: plan.planId,
    stateRevision: 3,
    selectedDeliverableId,
    entryMode: "execution",
    recommendedActionText,
  };
}

function resumeEntry(): DeliveryEntryInspectionResult {
  return {
    status: "resume-bound",
    nextAction: "read-position-and-reconcile",
    planId: plan.planId,
    stateRevision: 4,
    recommendedActionText,
  };
}

function snapshot(state: DeliveryStateV1) {
  return {
    target: state.target,
    members: state.members.slice(0, 1).map((member) => ({
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    })),
  };
}

function activeState(mode: "review-fix" | "selected-change" | "provider-refresh" | "provider-adoption") {
  const state = deliveryStateFixture(plan);
  const before = snapshot(state);
  const reserved = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
    operationId: `operation-${mode}`,
    kind: "rewrite",
    mode,
    affectedDeliverableIds: [selectedDeliverableId],
    expectedStateRevision: 3,
    before,
    requested: before,
    ...(mode === "provider-refresh" || mode === "provider-adoption"
      ? {
          reviewFixSelectedDeliverableId: selectedDeliverableId,
          reviewFixVerificationDeliverableIds: [selectedDeliverableId],
        }
      : {}),
  });
  if (reserved.status !== "reserved") throw new Error("continuation fixture must reserve");
  return { revision: 4, value: reserved.state };
}

function route(
  kind: "provider-refresh" | "rematerialize" | "terminal-authoring" | "terminal-rebind",
): DeliveryReviewFixRouteResult {
  const common = {
    status: "planned" as const,
    selectedDeliverableId,
    affectedDeliverableIds: [selectedDeliverableId],
    recommendedActionText,
  };
  if (kind === "provider-refresh") return {
    ...common,
    route: kind,
    nextAction: "publish-selected-member",
    candidateRequirements: { requiredAncestorHeads: ["4".repeat(40)] },
  };
  if (kind === "rematerialize") return { ...common, route: kind, nextAction: "rematerialize" };
  if (kind === "terminal-authoring") return { ...common, route: kind, nextAction: "author-terminal" };
  return {
    ...common,
    route: kind,
    nextAction: "reconcile-terminal-publication",
    reconcileInput: {
      planId: plan.planId,
      repository: request.repository,
      remote: request.remote,
      continuation: "read-position",
      reviewFixSelectedDeliverableId: selectedDeliverableId,
    },
  };
}

describe("delivery review-fix continuation projection", () => {
  it("binds pending verification and its acknowledgement to the exact terminal tree", () => {
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      pendingReviewFixVerification: {
        selectedDeliverableId,
        memberDeliverableIds: [selectedDeliverableId],
      },
    };
    const record = { revision: 9, value: state };
    const continuation = projectDeliveryReviewFixVerificationContinuation({ planId: plan.planId, state: record });
    if (continuation === null) throw new Error("verification continuation fixture must project");
    const entry: DeliveryEntryInspectionResult = {
      status: "review-fix-verification-required",
      planId: plan.planId,
      stateRevision: 9,
      ...continuation,
      recommendedActionText,
    };

    expect(projectDeliveryReviewFixContinuation({ request, entry })).toMatchObject({
      status: "verification-required",
      verification: {
        target: continuation.verification.target,
        tier1Reuse: { targetTree: continuation.verification.target.tree },
      },
    });
    const verification = {
      applicability: "focused" as const,
      target: continuation.verification.target,
      tier1: {
        outcome: "passed" as const,
        provenance: "exact-tree-reuse" as const,
        targetTree: continuation.verification.target.tree,
        coveredInputs: "unchanged" as const,
      },
      verificationEvidenceRefs: ["criteria://member", "gates://tier-1"],
    };
    expect(projectDeliveryReviewFixContinuation({ request: { ...request, verification }, entry })).toMatchObject({
      status: "dispatch",
      action: {
        kind: "delivery-review-fix-acknowledge",
        input: { ...continuation.acknowledgementInput, verification },
      },
    });
    expect(projectDeliveryReviewFixContinuation({
      request: { ...request, verification: { ...verification, target: { ...verification.target, tree: "f".repeat(40) } } },
      entry,
    })).toEqual({ status: "refused", reason: "verification-target-mismatch" });
  });

  it.each([
    ["review-fix", "delivery-reconcile"],
    ["selected-change", "delivery-reconcile"],
    ["provider-refresh", "delivery-refresh-execute"],
    ["provider-adoption", "delivery-refresh-adopt"],
  ] as const)("resumes a persisted %s operation through %s", (mode, actionKind) => {
    expect(projectDeliveryReviewFixContinuation({
      request,
      entry: resumeEntry(),
      state: activeState(mode),
    })).toMatchObject({
      status: "dispatch",
      action: { kind: actionKind, input: { planId: plan.planId } },
    });
  });

  it.each([
    ["provider-refresh", "dispatch", "delivery-review-fix-publish"],
    ["rematerialize", "dispatch", "delivery-rematerialize"],
    ["terminal-authoring", "authoring-required", undefined],
    ["terminal-rebind", "dispatch", "delivery-reconcile"],
  ] as const)("projects the %s correction route without a caller selector", (kind, status, actionKind) => {
    const result = projectDeliveryReviewFixContinuation({
      request,
      entry: correctionEntry(),
      route: route(kind),
      state: { revision: 3, value: deliveryStateFixture(plan) },
      activeBranch: "feat/example",
    });
    expect(result).toMatchObject({ status });
    if (actionKind !== undefined) expect(result).toMatchObject({ action: { kind: actionKind } });
  });

  it.each([
    ["candidate-renewal-required", "candidate-renewal"],
    ["continue-publication", "publication"],
    ["continue-hosted-review", "hosted-review"],
  ] as const)("preserves the %s authority boundary", (status, authority) => {
    const entry = status === "candidate-renewal-required"
      ? {
          status,
          nextAction: "renew-public-continuation" as const,
          planId: plan.planId,
          stateRevision: 10,
          attestationAction: { argv: ["arc", "attest", plan.workUnitId, "--json"] as const },
          recommendedActionText,
        }
      : status === "continue-publication"
        ? {
            status,
            nextAction: "continue-publication" as const,
            planId: plan.planId,
            stateRevision: 10,
            publicationAction: {
              kind: "continue-publication" as const,
              command: "arc publish example --json",
              interactionText: recommendedActionText,
            },
            recommendedActionText,
          }
        : {
            status,
            nextAction: "continue-hosted-review" as const,
            planId: plan.planId,
            stateRevision: 10,
            hostedReviewAction: {
              kind: "continue-hosted-review" as const,
              workUnitId: plan.workUnitId,
              command: `arc review status --work-unit ${plan.workUnitId} --json`,
              interactionText: recommendedActionText,
            },
            recommendedActionText,
          };
    expect(projectDeliveryReviewFixContinuation({ request, entry })).toMatchObject({
      status: "authority-required",
      authority,
    });
  });
});
