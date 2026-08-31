import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import type { DeliveryEntryInspectionResult } from
  "../../../src/lib/delivery/entry-inspection.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import {
  pendingDeliveryReviewFixAuthorityIsCurrent,
  projectDeliveryReviewFixContinuation,
  selectPendingDeliveryReviewFixAuthority,
} from
  "../../../src/lib/delivery/review-fix-continuation.js";
import { projectDeliveryReviewFixVerificationContinuation } from
  "../../../src/lib/delivery/review-fix-verification.js";
import type { DeliveryReviewFixRouteResult } from "../../../src/lib/delivery/review-fix.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { ApprovedDispositionRecordSchema } from
  "../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../src/scripts/review-gate/core/dispositions.js";
import {
  consumeFixAuthorization,
  createFixAuthorization,
} from "../../../src/scripts/review-gate/core/fix-authorization.js";
import { createReviewTarget } from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const request = { repository: "owner/repo", remote: "origin" } as const;
const selectedDeliverableId = plan.members[0]!.deliverableId;
const recommendedActionText = "Continue the exact correction.";

function deliveryDispositionRecord(input: {
  readonly operationId: string;
  readonly workUnitId?: string;
  readonly settled?: boolean;
}) {
  const oldTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
  const newTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "e".repeat(40),
    headTree: "f".repeat(40),
  });
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: oldTarget.targetId,
      policyVersion: canonicalDigest({ policy: "review" }),
      rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: "standard" }),
      proposedBy: "agent-1",
      findings: [{
        findingId: "finding-1",
        sourceIdentity: "codex-pr",
        locus: "src/review.ts:42",
        sourceVerification: "verified",
        verificationRefs: ["review:finding-1"],
        severity: "major",
        disposition: "fix",
        gating: "blocking",
        rationale: "The source confirms the issue.",
        recommendation: "Apply the fix.",
        openQuestions: [],
      }],
    })),
    approvedBy: "maintainer-1",
    approvedAt: "2026-08-31T12:00:00Z",
  });
  const fixAuthorization = createFixAuthorization({ dispositionState: approvedDisposition, oldTarget });
  const deliveryMember = {
    kind: "delivery-member" as const,
    planId: plan.planId,
    deliverableId: selectedDeliverableId,
    workUnitId: input.workUnitId ?? plan.workUnitId,
    head: oldTarget.headSha,
  };
  return ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: "repo-1",
    operationId: input.operationId,
    candidate: null,
    errand: null,
    deliveryMember,
    source: {
      kind: "hosted",
      attemptRef: `arc-review-source:v1:hosted:lane-progress%2F${input.operationId}:hosted%2F1`,
    },
    approvedDisposition,
    fixAuthorization,
    errandFixResponse: null,
    deliveryMemberFixResponse: input.settled !== true
      ? null
      : {
          oldTarget,
          newTarget,
          applicability: "focused",
          fixConsumption: consumeFixAuthorization({
            authorization: fixAuthorization,
            oldTarget,
            newTarget,
            appliedBy: "agent-1",
            consumedAt: "2026-08-31T13:00:00Z",
            verificationRefs: ["verification://focused-fix"],
            priorConsumptions: [],
          }),
          hostedTarget: { repository: "owner/repo", pullRequest: 42, headSha: oldTarget.headSha },
          hostedFixTarget: { repository: "owner/repo", pullRequest: 42, headSha: newTarget.headSha },
        },
  });
}

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

function currentChainState(): DeliveryStateV1 {
  const state = deliveryStateFixture(plan);
  return {
    ...state,
    members: state.members.map((member, index) => {
      if (index === 0) return member;
      const predecessor = state.members[index - 1]?.coordinates;
      if (predecessor === null || predecessor === undefined || member.coordinates === null) {
        throw new Error("continuation fixture requires complete member coordinates");
      }
      return { ...member, coordinates: { ...member.coordinates, base: predecessor.head } };
    }),
  };
}

function pendingSelectedRefreshState(): { readonly revision: number; readonly value: DeliveryStateV1 } {
  const state = currentChainState();
  const selected = state.members[0];
  if (selected?.coordinates === null || selected?.coordinates === undefined) {
    throw new Error("continuation fixture requires selected coordinates");
  }
  const selectedCoordinates = selected.coordinates;
  return {
    revision: 4,
    value: {
      ...state,
      members: state.members.map((member, index) => index === 0
        ? {
            ...member,
            coordinates: {
              ...selectedCoordinates,
              head: "9".repeat(40),
              tree: "8".repeat(40),
            },
          }
        : member),
    },
  };
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
  it("selects the one exact pending hosted member response and ignores unrelated or settled residue", () => {
    const pending = deliveryDispositionRecord({ operationId: "operation-pending" });
    expect(selectPendingDeliveryReviewFixAuthority({
      workUnitId: plan.workUnitId,
      records: [
        deliveryDispositionRecord({ operationId: "operation-settled", settled: true }),
        deliveryDispositionRecord({ operationId: "operation-unrelated", workUnitId: "other-work-unit" }),
        pending,
      ],
    })).toEqual({
      status: "selected",
      planId: plan.planId,
      selectedDeliverableId,
      reviewedHead: pending.deliveryMember?.head,
    });
  });

  it("refuses ambiguous or internally inexact pending hosted member authority", () => {
    const first = deliveryDispositionRecord({ operationId: "operation-first" });
    const second = deliveryDispositionRecord({ operationId: "operation-second" });
    expect(selectPendingDeliveryReviewFixAuthority({
      workUnitId: plan.workUnitId,
      records: [first, second],
    })).toEqual({ status: "refused", reason: "review-fix-response-ambiguous" });

    expect(selectPendingDeliveryReviewFixAuthority({
      workUnitId: plan.workUnitId,
      records: [{
        ...first,
        fixAuthorization: first.fixAuthorization === null
          ? null
          : { ...first.fixAuthorization, oldHeadSha: "9".repeat(40) },
      }],
    })).toEqual({ status: "refused", reason: "review-fix-response-invalid" });
  });

  it("retains response authority only through the exact selected-publication chain break", () => {
    const current = currentChainState();
    const reviewedHead = current.members[0]?.coordinates?.head;
    if (reviewedHead === undefined) throw new Error("continuation fixture requires reviewed coordinates");
    const input = { selectedDeliverableId, reviewedHead };

    expect(pendingDeliveryReviewFixAuthorityIsCurrent({ ...input, state: current })).toBe(true);

    const pending = pendingSelectedRefreshState().value;
    expect(pendingDeliveryReviewFixAuthorityIsCurrent({ ...input, state: pending })).toBe(true);

    const wrongBreak = {
      ...pending,
      members: pending.members.map((member, index) => index === 1 && member.coordinates !== null
        ? { ...member, coordinates: { ...member.coordinates, base: "7".repeat(40) } }
        : member),
    };
    expect(pendingDeliveryReviewFixAuthorityIsCurrent({ ...input, state: wrongBreak })).toBe(false);

    const refreshed = {
      ...pending,
      members: pending.members.map((member, index) => index === 1 && member.coordinates !== null
        ? { ...member, coordinates: { ...member.coordinates, base: pending.members[0]!.coordinates!.head } }
        : member),
    };
    expect(pendingDeliveryReviewFixAuthorityIsCurrent({ ...input, state: refreshed })).toBe(false);
  });

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
      state: { revision: 3, value: currentChainState() },
      activeBranch: "feat/example",
    });
    expect(result).toMatchObject({ status });
    if (actionKind !== undefined) expect(result).toMatchObject({ action: { kind: actionKind } });
  });

  it("advances a published selected correction into provider refresh", () => {
    expect(projectDeliveryReviewFixContinuation({
      request,
      entry: correctionEntry(),
      route: route("provider-refresh"),
      state: pendingSelectedRefreshState(),
      activeBranch: "feat/example",
    })).toMatchObject({
      status: "dispatch",
      action: {
        kind: "delivery-refresh-execute",
        input: {
          planId: plan.planId,
          scope: { kind: "dependent-suffix", selectedDeliverableId },
        },
      },
    });
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
