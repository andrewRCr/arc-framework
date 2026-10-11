import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { reconcileDeliveryExecution } from "../../../src/lib/delivery/landing.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import {
  completeDeliverySuffixMutationTail,
  executeFreshDeliverySuffixRematerialization,
  prepareDeliverySuffixRematerialization,
  type DeliverySuffixRematerializationDependencies,
} from "../../../src/lib/delivery/suffix-rematerialization.js";
import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import type { DeliveryEligibilitySnapshot } from "../../../src/lib/delivery/eligibility.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const state = deliveryStateFixture(plan);
  const first = state.members[0]!;
  const second = state.members[1]!;
  const third = state.members[2]!;
  const facts = {
    target: state.target,
    members: state.members,
    landedDeliverableIds: [first.deliverableId],
  };
  const target = state.target!;
  const snapshot: DeliveryEligibilitySnapshot = {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: target.ref, ...target.coordinates! },
    chainBase: target.coordinates!,
    predecessorRelation: {
      kind: "advanced",
      observedTip: target.coordinates!.head,
      chainBase: target.coordinates!.head,
    },
    top: { ref: "refs/heads/feat/control", head: "d".repeat(40), tree: "e".repeat(40) },
    members: [{ deliverableId: second.deliverableId, ref: "refs/heads/candidate/second", head: "a".repeat(40), tree: "b".repeat(40) }, {
      deliverableId: third.deliverableId, ref: "refs/heads/candidate/third", head: "c".repeat(40), tree: "d".repeat(40),
    }],
    lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
    regenerablePaths: [],
  };
  return { plan, state, facts, snapshot, first, second, third };
}

async function resolveCoordinate(head: string) {
  return { head, tree: "f".repeat(40) };
}

describe("delivery suffix rematerialization", () => {
  it("content-neutrally re-adopts the recut suffix and version-rebinds the terminal", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const adoptedHead = "9".repeat(40);
    const adoptTop = vi.fn(async () => (
      { status: "adopted" as const, head: adoptedHead, tree: terminal.coordinates!.tree }
    ));
    const publishTop = vi.fn(async () => ({ status: "published" as const }));
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 7, value: state },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [{
          deliverableId: highest.deliverableId,
          contribution: "changed",
          proof: "selected-change",
        }],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: { ref: terminal.ref!, head: terminal.coordinates!.head, tree: terminal.coordinates!.tree },
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop,
      publishTop,
      publishState: async (_planId, value, expectedRevision) => expectedRevision === 7
        ? { status: "ok", value: { revision: 8, value } }
        : { status: "refused" },
    });
    expect(result).toMatchObject({
      status: "rematerialized",
      state: {
        revision: 8,
        value: {
          members: expect.arrayContaining([{
            ...terminal,
            coordinates: {
              base: highest.coordinates!.head,
              head: adoptedHead,
              tree: terminal.coordinates!.tree,
            },
          }]),
          pendingReviewFixVerification: {
            selectedDeliverableId: highest.deliverableId,
            memberDeliverableIds: [highest.deliverableId],
          },
        },
      },
      nextAction: "verify-review-fix",
      acknowledgementInput: {
        selectedDeliverableId: highest.deliverableId,
        memberDeliverableIds: [highest.deliverableId],
        expectedStateRevision: 8,
        continuationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    expect(adoptTop).toHaveBeenCalledWith({
      topRef: terminal.ref,
      commonBase: state.target!.coordinates,
      highestMember: highest.coordinates,
      top: {
        ref: terminal.ref!,
        head: terminal.coordinates!.head,
        tree: terminal.coordinates!.tree,
      },
      finalCandidate: terminal.coordinates,
      lifecyclePaths: [],
    });
    expect(publishTop).toHaveBeenCalledWith({
      ref: terminal.ref,
      beforeHead: terminal.coordinates!.head,
      requestedHead: adoptedHead,
    });
  });

  it("uses the fresh append-only top as the rematerialization lease and persisted content baseline", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const liveTop = {
      ref: terminal.ref!,
      head: "8".repeat(40),
      tree: "7".repeat(40),
    };
    const adoptedHead = "9".repeat(40);
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 7, value: state },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: liveTop,
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop: async (input) => input.top.head === liveTop.head && input.top.tree === liveTop.tree
        ? { status: "adopted", head: adoptedHead, tree: liveTop.tree }
        : { status: "refused", reason: "top-moved" },
      publishTop: async (input) => input.beforeHead === liveTop.head
        ? { status: "published" }
        : { status: "refused" },
      publishState: async (_planId, value, expectedRevision) => expectedRevision === 7
        ? { status: "ok", value: { revision: 8, value } }
        : { status: "refused" },
    });
    expect(result).toMatchObject({
      status: "rematerialized",
      state: {
        revision: 8,
        value: {
          members: expect.arrayContaining([{
            ...terminal,
            coordinates: {
              base: highest.coordinates!.head,
              head: adoptedHead,
              tree: liveTop.tree,
            },
          }]),
        },
      },
    });
  });

  it("refuses rematerialization when the fresh top no longer descends from the retained binding", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 7, value: state },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: { ref: terminal.ref!, head: "8".repeat(40), tree: "7".repeat(40) },
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "not-ancestor",
      adoptTop: async () => ({ status: "adopted", head: "9".repeat(40), tree: "7".repeat(40) }),
      publishTop: async () => ({ status: "published" }),
      publishState: async (_planId, value) => ({
        status: "ok",
        value: { revision: 8, value },
      }),
    });
    expect(result).toEqual({ status: "refused", reason: "adoption-refused" });
  });

  it("refuses a stale writer at the terminal rebind", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 7, value: state },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: { ref: terminal.ref!, head: terminal.coordinates!.head, tree: terminal.coordinates!.tree },
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop: async () => ({ status: "adopted", head: "9".repeat(40), tree: terminal.coordinates!.tree }),
      publishTop: async () => ({ status: "published" }),
      publishState: async () => ({ status: "refused" }),
    });
    expect(result).toEqual({ status: "refused", reason: "state-moved" });
  });

  it("adopts an already rebound top and still persists the owed verification continuation", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const rebound = {
      ...state,
      members: state.members.map((member) => member.deliverableId === terminal.deliverableId
        ? { ...member, coordinates: { ...member.coordinates!, base: highest.coordinates!.head } }
        : member),
    };
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 8, value: rebound },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: { ref: terminal.ref!, head: terminal.coordinates!.head, tree: terminal.coordinates!.tree },
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop: async () => { throw new Error("must not create another adoption"); },
      publishTop: async () => ({ status: "adopted" }),
      publishState: async (_planId, value, expectedRevision) => expectedRevision === 8
        ? { status: "ok", value: { revision: 9, value } }
        : { status: "refused" },
    });
    expect(result).toMatchObject({
      status: "rematerialized",
      state: {
        revision: 9,
        value: {
          pendingReviewFixVerification: {
            selectedDeliverableId: highest.deliverableId,
            memberDeliverableIds: [highest.deliverableId],
          },
        },
      },
      acknowledgementInput: { expectedStateRevision: 9 },
    });
    if (result.status !== "rematerialized") throw new Error("rematerialization tail must settle");
    const replay = await completeDeliverySuffixMutationTail({
      rematerialized: result,
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: { ref: terminal.ref!, head: terminal.coordinates!.head, tree: terminal.coordinates!.tree },
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop: async () => { throw new Error("must not create another adoption"); },
      publishTop: async () => ({ status: "adopted" }),
      publishState: async () => { throw new Error("must not rewrite the exact pending continuation"); },
    });
    expect(replay).toEqual(result);
  });

  it("persists a moved live top even when predecessor absorption was already complete", async () => {
    const { state } = fixture();
    const highest = state.members.at(-2)!;
    const terminal = state.members.at(-1)!;
    const rebound = {
      ...state,
      members: state.members.map((member) => member.deliverableId === terminal.deliverableId
        ? { ...member, coordinates: { ...member.coordinates!, base: highest.coordinates!.head } }
        : member),
    };
    const liveTop = { ref: terminal.ref!, head: "8".repeat(40), tree: "7".repeat(40) };
    const result = await completeDeliverySuffixMutationTail({
      rematerialized: {
        status: "rematerialized",
        state: { revision: 8, value: rebound },
        selectedDeliverableId: highest.deliverableId,
        contributionVerdicts: [],
        nextAction: "verify-review-fix",
        verification: { memberDeliverableIds: [highest.deliverableId], commitGateRequired: true },
      },
      commonBase: state.target!.coordinates!,
      topRef: terminal.ref!,
      top: liveTop,
      finalCandidate: terminal.coordinates!,
      lifecyclePaths: [],
    }, {
      readAncestry: async () => "ancestor",
      adoptTop: async () => { throw new Error("must not create another adoption"); },
      publishTop: async () => ({ status: "adopted" }),
      publishState: async (_planId, value, expectedRevision) => expectedRevision === 8
        ? { status: "ok", value: { revision: 9, value } }
        : { status: "refused" },
    });
    expect(result).toMatchObject({
      status: "rematerialized",
      state: {
        revision: 9,
        value: {
          members: expect.arrayContaining([{
            ...terminal,
            coordinates: { base: highest.coordinates!.head, head: liveTop.head, tree: liveTop.tree },
          }]),
        },
      },
    });
  });

  it("accepts a selected fix and requires every unselected suffix contribution to carry", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const proveCarried = vi.fn(async () => ({ status: "accepted" as const, proof: "mechanical-reapply" as const }));
    const result = await prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId], resolveCoordinate, proveCarried,
    });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0]?.requested.members[0]?.changeRequest).toEqual(second.changeRequest);
    expect(result.contributionVerdicts).toEqual([
      {
        deliverableId: second.deliverableId,
        contribution: "changed",
        proof: "selected-change",
      },
      {
        deliverableId: snapshot.members[1]!.deliverableId,
        contribution: "equivalent",
        proof: "mechanical-reapply",
      },
    ]);
    expect(proveCarried).toHaveBeenCalledOnce();
  });

  it("compares a disjoint suffix against the persisted chain base", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const observedTip = { head: "9".repeat(40), tree: "8".repeat(40) };
    const disjointSnapshot: DeliveryEligibilitySnapshot = {
      ...snapshot,
      protectedBase: { ref: snapshot.protectedBase.ref, ...observedTip },
      predecessorRelation: {
        kind: "diverged",
        observedTip: observedTip.head,
        chainBase: snapshot.chainBase.head,
        mergeBase: snapshot.chainBase.head,
        mergeBaseCount: 1,
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    };

    const result = await prepareDeliverySuffixRematerialization({
      plan,
      state,
      facts,
      eligibleSnapshot: disjointSnapshot,
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
    });
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(result.rewrites[0]?.requested.members[0]?.coordinates?.base).toBe(snapshot.chainBase.head);
  });

  it("recloses and re-proves each rewrite against the preceding persisted result", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    let current = { revision: 7, value: initial };
    const first = initial.members[0]!;
    const suffix = plan.members.slice(1);
    const target = initial.target!;
    const snapshot: DeliveryEligibilitySnapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: target.ref, ...target.coordinates! },
      chainBase: target.coordinates!,
      predecessorRelation: {
        kind: "advanced",
        observedTip: target.coordinates!.head,
        chainBase: target.coordinates!.head,
      },
      top: { ref: "refs/heads/control", head: "d".repeat(40), tree: "e".repeat(40) },
      members: suffix.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 2}`,
        head: String(index + 7).repeat(40),
        tree: String(index + 4).repeat(40),
      })),
      lifecyclePaths: [],
      regenerablePaths: [],
    };
    const seenRevisions: number[] = [];
    const seenSnapshots: DeliveryEligibilitySnapshot[] = [];
    const proveCarried = vi.fn(async () => ({ status: "accepted" as const, proof: "mechanical-reapply" as const }));
    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [initial.members[1]!.deliverableId],
    }, {
      reobserve: async () => ({
        status: "observed",
        plan,
        current,
        facts: { target: current.value.target, members: current.value.members, landedDeliverableIds: [first.deliverableId] },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried,
      apply: async ({ current: input, rewrite, snapshot: admittedSnapshot }) => {
        seenRevisions.push(input.revision);
        seenSnapshots.push(admittedSnapshot);
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied", state: current };
      },
    });
    expect(result.status).toBe("rematerialized");
    expect(result).toMatchObject({
      nextAction: "verify-review-fix",
      verification: {
        memberDeliverableIds: [initial.members[1]!.deliverableId],
        commitGateRequired: true,
      },
    });
    expect(seenRevisions).toEqual([7, 8]);
    expect(seenSnapshots).toEqual([snapshot, snapshot]);
    expect(proveCarried).toHaveBeenCalledTimes(6);
  });

  it("preserves an exact reservation refusal without a live supersession", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    let seenSupersession: unknown;
    const apply = vi.fn(async (
      input: Parameters<DeliverySuffixRematerializationDependencies["apply"]>[0],
    ) => {
      seenSupersession = input.supersedePendingReviewFixVerification;
      return {
        status: "refused" as const,
        reason: "pending-review-fix-verification" as const,
      };
    });
    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
    }, {
      reobserve: async () => ({
        status: "observed",
        plan,
        current: { revision: 7, value: state },
        facts,
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply,
    });
    expect(result).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      rewrite: expect.objectContaining({ deliverableId: second.deliverableId }),
    }));
    expect(seenSupersession).toBeUndefined();
  });

  it("carries pending verification through an earlier predecessor rewrite", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const first = initial.members[0]!;
    const selected = initial.members[2]!;
    const target = initial.target!;
    const pendingReviewFixVerification = {
      selectedDeliverableId: selected.deliverableId,
      memberDeliverableIds: [selected.deliverableId, initial.members[3]!.deliverableId],
    };
    let current: { revision: number; value: DeliveryStateV1 } = {
      revision: 7,
      value: { ...initial, pendingReviewFixVerification },
    };
    const suffix = plan.members.slice(1);
    const snapshot: DeliveryEligibilitySnapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: target.ref, ...target.coordinates! },
      chainBase: target.coordinates!,
      predecessorRelation: {
        kind: "advanced",
        observedTip: target.coordinates!.head,
        chainBase: target.coordinates!.head,
      },
      top: { ref: "refs/heads/control", head: "d".repeat(40), tree: "e".repeat(40) },
      members: suffix.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 2}`,
        head: String(index + 7).repeat(40),
        tree: String(index + 4).repeat(40),
      })),
      lifecyclePaths: [],
      regenerablePaths: [],
    };
    const supersessions: unknown[] = [];

    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selected.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification: pendingReviewFixVerification,
        expectedStateRevision: current.revision,
        continuationDigest: canonicalDigest(current.value),
      },
    }, {
      reobserve: async () => ({
        status: "observed",
        plan,
        current,
        facts: {
          target: current.value.target,
          members: current.value.members,
          landedDeliverableIds: [first.deliverableId],
        },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      apply: async ({ current: input, rewrite, supersedePendingReviewFixVerification }) => {
        const supersession: unknown = supersedePendingReviewFixVerification;
        supersessions.push(supersession);
        if (JSON.stringify(supersession) !== JSON.stringify(pendingReviewFixVerification)) {
          return { status: "refused", reason: "pending-review-fix-verification" };
        }
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            pendingReviewFixVerification,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied", state: current };
      },
    });

    expect(result).toMatchObject({ status: "rematerialized", selectedDeliverableId: selected.deliverableId });
    expect(result).toMatchObject({
      verification: { memberDeliverableIds: pendingReviewFixVerification.memberDeliverableIds },
    });
    expect(supersessions).toEqual([pendingReviewFixVerification, pendingReviewFixVerification]);
  });

  async function expectPredecessorRecovery(recoveryKind: "cleared" | "adopted"): Promise<void> {
    const { plan, state, snapshot, first, second } = fixture();
    const pendingReviewFixVerification = {
      selectedDeliverableId: second.deliverableId,
      memberDeliverableIds: [second.deliverableId],
    };
    const pending = { ...state, pendingReviewFixVerification };
    const before = { target: state.target, members: [first] };
    const requested = {
      ...before,
      members: [{
        ...first,
        coordinates: first.coordinates === null
          ? null
          : { ...first.coordinates, head: "e".repeat(40) },
      }],
    };
    const reserved = reserveDeliveryOperation({ revision: 7, value: pending }, plan, {
      operationId: "operation-rematerialize-predecessor",
      kind: "rewrite",
      mode: "review-fix",
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 7,
      before,
      requested,
      supersedePendingReviewFixVerification: pendingReviewFixVerification,
      reviewFixSelectedDeliverableId: second.deliverableId,
      reviewFixVerificationDeliverableIds: pendingReviewFixVerification.memberDeliverableIds,
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve the predecessor rewrite");
    let current: { revision: number; value: DeliveryStateV1 } = { revision: 8, value: reserved.state };
    const recovery = await reconcileDeliveryExecution({
      planId: plan.planId,
      current,
      observation: {
        observe: async () => ({
          status: "observed" as const,
          value: recoveryKind === "cleared" ? before : requested,
        }),
      },
      stateStore: { publish: async (_planId, value, expectedRevision) => {
        if (expectedRevision !== current.revision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        current = { revision: current.revision + 1, value };
        return { status: "ok" as const, value: current };
      } },
    });
    if (recovery.status !== "retryable" || recovery.action !== "delivery-rematerialize") {
      throw new Error("recovery must return a rematerialization rerun");
    }
    if (!("reviewFixSelectedDeliverableId" in recovery.selector)) {
      throw new Error("recovery must retain the selected rematerialization subject");
    }
    const selector = recovery.selector;
    const supersession = selector.supersedePendingReviewFixVerification;

    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selector.reviewFixSelectedDeliverableId],
      supersedePendingReviewFixVerification: supersession,
    }, {
      reobserve: async () => ({
        status: "observed",
        plan,
        current,
        facts: {
          target: current.value.target,
          members: current.value.members,
          landedDeliverableIds: [first.deliverableId],
        },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      apply: async ({ current: input, rewrite, supersedePendingReviewFixVerification }) => {
        if (JSON.stringify(supersedePendingReviewFixVerification)
          !== JSON.stringify(pendingReviewFixVerification)) {
          return { status: "refused", reason: "pending-review-fix-verification" };
        }
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied", state: current };
      },
    });

    expect(result).toMatchObject({
      status: "rematerialized",
      selectedDeliverableId: second.deliverableId,
      verification: { memberDeliverableIds: pendingReviewFixVerification.memberDeliverableIds },
    });
  }

  it("executes a cleared predecessor recovery through its returned supersession identity", async () => {
    await expectPredecessorRecovery("cleared");
  });

  it("executes an adopted predecessor recovery through its returned supersession identity", async () => {
    await expectPredecessorRecovery("adopted");
  });

  it("refuses a delayed supersession when pending verification has expanded", async () => {
    const { plan, state, facts, snapshot, second, third } = fixture();
    const projectedPendingVerification = {
      selectedDeliverableId: second.deliverableId,
      memberDeliverableIds: [second.deliverableId],
    };
    const newerPendingVerification = {
      selectedDeliverableId: second.deliverableId,
      memberDeliverableIds: [second.deliverableId, third.deliverableId],
    };
    const current = {
      revision: 7,
      value: { ...state, pendingReviewFixVerification: newerPendingVerification },
    };
    const projectedState = { ...state, pendingReviewFixVerification: projectedPendingVerification };

    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification: projectedPendingVerification,
        expectedStateRevision: current.revision,
        continuationDigest: canonicalDigest(projectedState),
      },
    }, {
      reobserve: async () => ({ status: "observed", plan, current, facts, snapshot }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async ({ supersedePendingReviewFixVerification }) => {
        if (supersedePendingReviewFixVerification === undefined) return { status: "refused" };
        if (JSON.stringify(supersedePendingReviewFixVerification)
          !== JSON.stringify(newerPendingVerification)) {
          return { status: "refused", reason: "pending-review-fix-verification" };
        }
        return { status: "applied", state: current };
      },
    });

    expect(result).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });

  it("refuses a delayed supersession after its pending marker is cleared", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const pendingVerification = {
      selectedDeliverableId: second.deliverableId,
      memberDeliverableIds: [second.deliverableId],
    };
    const projectedState = { ...state, pendingReviewFixVerification: pendingVerification };
    const current = { revision: 8, value: state };

    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification,
        expectedStateRevision: 7,
        continuationDigest: canonicalDigest(projectedState),
      },
    }, {
      reobserve: async () => ({ status: "observed", plan, current, facts, snapshot }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => ({ status: "applied", state: current }),
    });

    expect(result).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });

  it("refuses a delayed supersession after an identical marker is recreated", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    const pendingVerification = {
      selectedDeliverableId: second.deliverableId,
      memberDeliverableIds: [second.deliverableId],
    };
    const projectedState = { ...state, pendingReviewFixVerification: pendingVerification };
    const current = { revision: 9, value: projectedState };

    const result = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification,
        expectedStateRevision: 7,
        continuationDigest: canonicalDigest(projectedState),
      },
    }, {
      reobserve: async () => ({ status: "observed", plan, current, facts, snapshot }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => ({ status: "applied", state: current }),
    });

    expect(result).toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });

  it("resumes after a persisted predecessor rewrite without weakening carried contribution proof", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const first = initial.members[0]!;
    const selected = initial.members[1]!;
    const pendingReviewFixVerification = {
      selectedDeliverableId: selected.deliverableId,
      memberDeliverableIds: [selected.deliverableId, initial.members[2]!.deliverableId],
    };
    let current = {
      revision: 7,
      value: { ...initial, pendingReviewFixVerification },
    };
    const target = initial.target!;
    const suffix = plan.members.slice(1);
    const snapshot: DeliveryEligibilitySnapshot = {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      planRevision: plan.planRevision,
      planDigest: plan.planDigest,
      protectedBase: { ref: target.ref, ...target.coordinates! },
      chainBase: target.coordinates!,
      predecessorRelation: {
        kind: "advanced",
        observedTip: target.coordinates!.head,
        chainBase: target.coordinates!.head,
      },
      top: { ref: "refs/heads/control", head: "d".repeat(40), tree: "e".repeat(40) },
      members: suffix.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/heads/candidate-${index + 2}`,
        head: String(index + 7).repeat(40),
        tree: String(index + 4).repeat(40),
      })),
      lifecyclePaths: [],
      regenerablePaths: [],
    };
    const originalBaseByMemberHead = new Map(initial.members.slice(2).map((member) => [
      member.coordinates!.head,
      member.coordinates!.base,
    ]));
    const resolveCoordinate = async (head: string) => ({ head, tree: "0".repeat(40) });
    const proveCarried = vi.fn(async (endpoints: DeliveryContributionEndpoints) =>
      (endpoints.before.predecessor.head === endpoints.after.predecessor.head
        && endpoints.before.member.head === endpoints.after.member.head)
      || originalBaseByMemberHead.get(endpoints.before.member.head) === endpoints.before.predecessor.head
      ? { status: "accepted" as const, proof: "mechanical-reapply" as const }
      : { status: "refused" as const, reason: "git-failure" as const });
    let interruptSecondRewrite = true;
    let applyCount = 0;
    const dependencies: DeliverySuffixRematerializationDependencies = {
      reobserve: async () => ({
        status: "observed" as const,
        plan,
        current,
        facts: {
          target: current.value.target,
          members: current.value.members,
          landedDeliverableIds: [first.deliverableId],
        },
        snapshot,
      }),
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried,
      apply: async ({ current: input, rewrite, supersedePendingReviewFixVerification }) => {
        applyCount += 1;
        if (interruptSecondRewrite && applyCount === 2) return { status: "refused" as const };
        if (JSON.stringify(supersedePendingReviewFixVerification)
          !== JSON.stringify(pendingReviewFixVerification)) {
          return { status: "refused" as const, reason: "pending-review-fix-verification" as const };
        }
        current = {
          revision: input.revision + 1,
          value: {
            ...input.value,
            pendingReviewFixVerification,
            members: input.value.members.map((member) => member.deliverableId === rewrite.deliverableId
              ? { ...member, ...rewrite.requested.members[0] }
              : member),
          },
        };
        return { status: "applied" as const, state: current };
      },
    };

    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selected.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification: pendingReviewFixVerification,
        expectedStateRevision: current.revision,
        continuationDigest: canonicalDigest(current.value),
      },
    }, dependencies)).resolves.toEqual({ status: "refused", reason: "rewrite-refused" });
    const interruptedRevision = current.revision;
    interruptSecondRewrite = false;
    applyCount = 0;
    const resumed = await executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [selected.deliverableId],
      supersedePendingReviewFixVerification: {
        pendingVerification: pendingReviewFixVerification,
        expectedStateRevision: current.revision,
        continuationDigest: canonicalDigest(current.value),
      },
    }, dependencies);
    expect(resumed).toMatchObject({
      status: "rematerialized",
      verification: { memberDeliverableIds: pendingReviewFixVerification.memberDeliverableIds },
    });
    expect(current.revision).toBeGreaterThan(interruptedRevision);
  });

  it("refuses candidate movement and selection outside the exact suffix", async () => {
    const { plan, state, facts, snapshot, second, third } = fixture();
    const fresh = async () => ({ status: "observed" as const, plan, current: { revision: 7, value: state }, facts, snapshot });
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [second.deliverableId],
    }, {
      reobserve: fresh,
      reobserveCandidate: async () => false,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "candidate-moved" });
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [state.members[0]!.deliverableId],
    }, {
      reobserve: fresh,
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "selected-member-invalid" });
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: [third.deliverableId],
    }, {
      reobserve: fresh,
      reobserveCandidate: async () => true,
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("preserves the exact eligibility refusal that prevents rematerialization", async () => {
    await expect(executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: ["sha256:01f4287446b8415cfa2bd95bebde24c15a6e264ca9820dfe1c82a1e8d30a8bd2"],
    }, {
      reobserve: async () => ({ status: "refused", reason: "completeness-mismatched" }),
      reobserveCandidate: async () => { throw new Error("must not inspect a candidate"); },
      resolveCoordinate: async () => { throw new Error("must not resolve coordinates"); },
      proveCarried: async () => { throw new Error("must not prove contribution"); },
      apply: async () => { throw new Error("must not apply"); },
    })).resolves.toEqual({ status: "refused", reason: "completeness-mismatched" });
  });

  it("refuses incomplete/direct-delivery candidates and accidental unselected changes", async () => {
    const { plan, state, facts, snapshot, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: { ...snapshot, members: snapshot.members.slice(0, 1) },
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "suffix-incomplete" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts,
      eligibleSnapshot: { ...snapshot, members: [{ ...snapshot.members[0]!, ref: "refs/heads/delivery/x/y" }, snapshot.members[1]!] },
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "direct-delivery-ref" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({
        status: "refused",
        reason: "contribution-conflicted",
        paths: ["shared.txt"],
      }),
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: ["shared.txt"],
    });
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts, eligibleSnapshot: snapshot,
      selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["feature.txt"],
      }),
    })).resolves.toEqual({
      status: "refused",
      reason: "contribution-diverged",
      paths: ["feature.txt"],
    });
  });

  it("keeps the landed prefix exact and routes semantic changes through plan amendment", async () => {
    const { plan, state, facts, snapshot, first, second } = fixture();
    await expect(prepareDeliverySuffixRematerialization({
      plan, state, facts: { ...facts, members: [{ ...first, coordinates: { ...first.coordinates!, head: "f".repeat(40) } }, ...facts.members.slice(1)] },
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toEqual({ status: "refused", reason: "position-mismatch" });
    await expect(prepareDeliverySuffixRematerialization({
      plan, proposedPlan: { ...plan, planRevision: plan.planRevision + 1 }, state, facts,
      eligibleSnapshot: snapshot, selectedDeliverableIds: [second.deliverableId],
      resolveCoordinate,
      proveCarried: async () => ({ status: "accepted", proof: "tree-equality" }),
    })).resolves.toMatchObject({ status: "plan-amendment" });
  });
});
