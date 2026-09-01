import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  projectDeliveryPublicReviewContinuation,
  validateDeliveryPublicReviewContinuation,
} from
  "../../../src/lib/delivery/public-review-continuation.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";

const plan = deliveryStackPlanFixture();

function publicState(): DeliveryStateV1 {
  const state = deliveryStateFixture(plan);
  return {
    ...state,
    members: state.members.map((member, index) => ({
      ...member,
      changeRequest: {
        providerId: "github",
        changeRequestId: String(index + 101),
      },
    })),
  };
}

describe("delivery public review continuation", () => {
  it("binds one continuation to the exact coherent plan, state, and complete member evidence", () => {
    const state = publicState();
    const result = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 });

    expect(result).toEqual({
      status: "projected",
      continuation: {
        schemaVersion: 1,
        semanticsVersion: "delivery-public-review-continuation/v1",
        planId: plan.planId,
        planRevision: plan.planRevision,
        planDigest: plan.planDigest,
        stateRevision: 7,
        stateDigest: canonicalDigest(state),
        memberEvidenceDigest: canonicalDigest(state.members),
      },
    });
  });

  it("refuses when any public member lacks an exact ref, change request, or coordinate binding", () => {
    const state = publicState();
    state.members[0] = { ...state.members[0]!, changeRequest: null };

    expect(projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 })).toEqual({
      status: "refused",
      reason: "member-evidence-incomplete",
    });
  });

  it("refuses while delivery mutation or its exact post-fix verification is still pending", () => {
    const state = publicState();
    state.pendingReviewFixVerification = {
      selectedDeliverableId: state.members[0]!.deliverableId,
      memberDeliverableIds: [state.members[0]!.deliverableId],
    };

    expect(projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 })).toEqual({
      status: "refused",
      reason: "state-not-idle",
    });
  });

  it("accepts a persisted continuation only when fresh delivery evidence reproduces it exactly", () => {
    const state = publicState();
    const projected = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 });
    if (projected.status !== "projected") throw new Error("fixture continuation must project");

    expect(validateDeliveryPublicReviewContinuation({
      continuation: projected.continuation,
      plan,
      state,
      stateRevision: 7,
    })).toEqual({ status: "current" });
  });

  it("preserves a continuation across one proven terminal-coordinate-only advance", () => {
    const state = publicState();
    const projected = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 });
    if (projected.status !== "projected") throw new Error("fixture continuation must project");
    const currentHead = "f".repeat(40);
    const advanced = structuredClone(state);
    advanced.members.at(-1)!.coordinates = {
      ...advanced.members.at(-1)!.coordinates!,
      head: currentHead,
      tree: "e".repeat(40),
    };

    expect(validateDeliveryPublicReviewContinuation({
      continuation: projected.continuation,
      plan,
      state: advanced,
      stateRevision: 8,
      terminalCoordinateAdvance: {
        priorHead: state.members.at(-1)!.coordinates!.head,
        priorTree: state.members.at(-1)!.coordinates!.tree,
        currentHead,
        currentTree: "e".repeat(40),
        proof: "subject-equality",
      },
    })).toEqual({ status: "current" });

    advanced.members[0] = {
      ...advanced.members[0]!,
      coordinates: { ...advanced.members[0]!.coordinates!, head: "9".repeat(40) },
    };
    expect(validateDeliveryPublicReviewContinuation({
      continuation: projected.continuation,
      plan,
      state: advanced,
      stateRevision: 8,
      terminalCoordinateAdvance: {
        priorHead: state.members.at(-1)!.coordinates!.head,
        priorTree: state.members.at(-1)!.coordinates!.tree,
        currentHead,
        currentTree: "e".repeat(40),
        proof: "subject-equality",
      },
    })).toEqual({ status: "refused", reason: "state-mismatch" });
  });

  it("classifies stale plan, state, and member bindings without accepting a partial match", () => {
    const state = publicState();
    const projected = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision: 7 });
    if (projected.status !== "projected") throw new Error("fixture continuation must project");
    const otherDigest = `sha256:${"0".repeat(64)}`;

    const cases = [
      {
        continuation: { ...projected.continuation, planDigest: otherDigest },
        stateRevision: 7,
        reason: "plan-mismatch",
      },
      {
        continuation: projected.continuation,
        stateRevision: 8,
        reason: "state-mismatch",
      },
      {
        continuation: { ...projected.continuation, memberEvidenceDigest: otherDigest },
        stateRevision: 7,
        reason: "member-evidence-mismatch",
      },
    ];
    for (const entry of cases) {
      expect(validateDeliveryPublicReviewContinuation({
        continuation: entry.continuation,
        plan,
        state,
        stateRevision: entry.stateRevision,
      })).toEqual({ status: "refused", reason: entry.reason });
    }
  });
});
