import { describe, expect, it, vi } from "vitest";

import {
  planDeliveryReviewFixRoute,
  publishSelectedDeliveryReviewFix,
} from "../../../src/lib/delivery/review-fix.js";
import type { DeliveryNativeStackObservation } from "../../../src/lib/delivery/native-stack.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture() {
  const plan = deliveryFourMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const state = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(700 + index) },
    })),
  };
  return { plan, state };
}

describe("delivery review-fix routing", () => {
  it("routes exact registered and unregistered presentation without guessing", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members[1]!.deliverableId;

    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      selectedDeliverableId,
      observation: { status: "registered", stackNumber: 42 },
    })).toMatchObject({
      status: "planned",
      route: "provider-refresh",
      selectedDeliverableId,
      affectedDeliverableIds: plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "publish-selected-member",
    });
    expect(planDeliveryReviewFixRoute({
      plan,
      state,
      selectedDeliverableId,
      observation: { status: "unregistered" },
    })).toMatchObject({
      status: "planned",
      route: "rematerialize",
      selectedDeliverableId,
      affectedDeliverableIds: plan.members.slice(1, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "rematerialize",
    });
  });

  it("refuses every uncertain provider presentation before selecting a mutation model", () => {
    const { plan, state } = fixture();
    const selectedDeliverableId = plan.members[0]!.deliverableId;
    const observations: DeliveryNativeStackObservation[] = [
      { status: "partial", affectedDeliverableIds: [selectedDeliverableId] },
      { status: "incoherent", affectedDeliverableIds: [selectedDeliverableId] },
      { status: "unsupported" },
      { status: "unavailable" },
      { status: "malformed" },
      { status: "ambiguous" },
    ];

    for (const observation of observations) {
      expect(planDeliveryReviewFixRoute({ plan, state, selectedDeliverableId, observation }))
        .toMatchObject({ status: "refused", reason: `presentation-${observation.status}` });
    }
  });

  it("publishes only one exact descendant candidate and returns the native refresh continuation", async () => {
    const { plan, state } = fixture();
    const selected = state.members[0]!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members[0]!.chunkKey}`;
    const writes: DeliveryStateV1[] = [];
    const rewriteRef = vi.fn(async () => ({ status: "rewritten" as const }));

    const result = await publishSelectedDeliveryReviewFix({
      plan,
      current: { revision: 7, value: state },
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered", stackNumber: 42 },
    }, {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async () => "ancestor",
      revalidateLifecycle: async () => ({ status: "ok" }),
      reobservePresentation: async () => ({ status: "registered", stackNumber: 42 }),
      rewriteRef,
      observePublishedMember: async () => true,
      stateStore: { publish: async (_planId, value, revision) => {
        writes.push(value);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(rewriteRef).toHaveBeenCalledWith({
      ref: selected.ref,
      beforeHead: selected.coordinates!.head,
      requestedHead: candidate.head,
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.activeOperation).toMatchObject({ kind: "rewrite", mode: "selected-change" });
    expect(writes[1]?.members.map(({ coordinates }) => coordinates?.head)).toEqual([
      candidate.head,
      ...state.members.slice(1).map(({ coordinates }) => coordinates?.head),
    ]);
    expect(result).toMatchObject({
      status: "published",
      selectedDeliverableId: selected.deliverableId,
      affectedDeliverableIds: plan.members.slice(0, -1).map(({ deliverableId }) => deliverableId),
      nextAction: "execute-provider-refresh",
    });
  });

  it("routes a changed highest member through the zero-movement refresh executor and refuses unsafe candidate facts", async () => {
    const { plan, state } = fixture();
    const selected = state.members.at(-2)!;
    const candidate = { head: "d".repeat(40), tree: "e".repeat(40) };
    const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${plan.members.at(-2)!.chunkKey}`;
    const common = {
      plan,
      current: { revision: 7, value: state },
      selectedDeliverableId: selected.deliverableId,
      candidateRef,
      expectedCandidateRef: candidateRef,
      observation: { status: "registered" as const, stackNumber: 42 },
    };
    const dependencies = {
      inspectCandidate: async () => ({ ...candidate, trackedDirty: false }),
      observeCandidateRef: async () => candidate,
      readAncestry: async () => "ancestor" as const,
      revalidateLifecycle: async () => ({ status: "ok" as const }),
      reobservePresentation: async () => ({ status: "registered" as const, stackNumber: 42 }),
      rewriteRef: async () => ({ status: "rewritten" as const }),
      observePublishedMember: async () => true,
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1, revision: number) => ({
        status: "ok" as const, value: { revision: revision + 1, value },
      }) },
    };
    await expect(publishSelectedDeliveryReviewFix(common, dependencies)).resolves.toMatchObject({
      status: "published",
      nextAction: "execute-provider-refresh",
      affectedDeliverableIds: [selected.deliverableId],
    });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      inspectCandidate: async () => ({ ...candidate, trackedDirty: true }),
    })).resolves.toEqual({ status: "refused", reason: "candidate-dirty" });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      readAncestry: async () => "not-ancestor",
    })).resolves.toEqual({ status: "refused", reason: "candidate-not-descendant" });
    await expect(publishSelectedDeliveryReviewFix(common, {
      ...dependencies,
      revalidateLifecycle: async () => ({ status: "refused" }),
    })).resolves.toEqual({ status: "refused", reason: "lifecycle-contribution" });
  });
});
