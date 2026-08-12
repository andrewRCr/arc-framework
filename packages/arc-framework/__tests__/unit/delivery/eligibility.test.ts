/** Mechanical eligibility tests for operator-authored delivery candidate chains. */

import { describe, expect, it, vi } from "vitest";

import { deliveryPlanFixture, deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import {
  closeDeliveryEligibility,
  prepareDeliveryEligibility,
  verifyDeliveryCandidateCheckout,
  type DeliveryEligibilityDependencies,
} from "../../../src/lib/delivery/eligibility.js";

const oid = (character: string): string => character.repeat(40);

function dependencies(): DeliveryEligibilityDependencies {
  const coordinates = new Map([
    ["main", { head: oid("a"), tree: oid("1") }],
    ["control", { head: oid("d"), tree: oid("4") }],
    ["candidate/first", { head: oid("b"), tree: oid("2") }],
    ["candidate/second", { head: oid("c"), tree: oid("4") }],
  ]);
  return {
    observeRef: vi.fn(async (ref: string) => coordinates.get(ref) ?? null),
    readAncestry: vi.fn(async () => "ancestor" as const),
    revalidateLifecycleContribution: vi.fn(async () => ({ status: "ok" as const })),
    compareNormalizedCompleteness: vi.fn(async () => ({ status: "match" as const })),
    readCurrentPlan: vi.fn(async () => deliveryStackPlanFixture()),
    resolveMember: vi.fn(async () => ({ status: "ok" as const, value: null })),
    inspectCheckout: vi.fn(async () => ({ head: oid("b"), tree: oid("2"), trackedDirty: false })),
  };
}

function candidates() {
  const plan = deliveryStackPlanFixture();
  return plan.members.map((member, index) => ({
    deliverableId: member.deliverableId,
    ref: index === 0 ? "candidate/first" : "candidate/second",
  }));
}

describe("prepareDeliveryEligibility", () => {
  it("refuses a non-stack plan before observing Git", async () => {
    const deps = dependencies();
    const result = await prepareDeliveryEligibility({
      plan: deliveryPlanFixture(),
      protectedBaseRef: "main",
      controlRef: "control",
      candidates: [],
      lifecyclePaths: [],
    }, deps);

    expect(result).toEqual({ status: "refused", reason: "invalid-stack-plan" });
    expect(deps.observeRef).not.toHaveBeenCalled();
  });

  it("pins one ordered exact candidate per plan member", async () => {
    const result = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(),
      protectedBaseRef: "main",
      controlRef: "control",
      candidates: candidates(),
      lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
    }, dependencies());

    expect(result).toMatchObject({
      status: "prepared",
      snapshot: {
        planRevision: 1,
        protectedBase: { ref: "main", head: oid("a"), tree: oid("1") },
        control: { ref: "control", head: oid("d"), tree: oid("4") },
        members: [
          { ref: "candidate/first", head: oid("b"), tree: oid("2") },
          { ref: "candidate/second", head: oid("c"), tree: oid("4") },
        ],
      },
    });
  });

  it.each([
    ["missing-candidate", () => candidates().slice(0, 1)],
    ["duplicate-candidate", () => [candidates()[0]!, candidates()[0]!]],
    ["reordered-candidate", () => candidates().reverse()],
  ] as const)("refuses %s membership", async (reason, makeCandidates) => {
    const result = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(),
      protectedBaseRef: "main",
      controlRef: "control",
      candidates: makeCandidates(),
      lifecyclePaths: [],
    }, dependencies());
    expect(result).toMatchObject({ status: "refused", reason });
  });

  it("names a candidate whose ancestry or lifecycle facts refuse", async () => {
    const plan = deliveryStackPlanFixture();
    const deps = dependencies();
    deps.readAncestry = vi.fn(async () => "not-ancestor" as const);
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", controlRef: "control", candidates: candidates(), lifecyclePaths: [],
    }, deps)).resolves.toEqual({
      status: "refused", reason: "wrong-predecessor", deliverableId: plan.members[0]!.deliverableId,
    });

    const lifecycleDeps = dependencies();
    lifecycleDeps.revalidateLifecycleContribution = vi.fn(async () => ({ status: "refused" as const }));
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", controlRef: "control", candidates: candidates(), lifecyclePaths: ["meta.md"],
    }, lifecycleDeps)).resolves.toEqual({
      status: "refused", reason: "lifecycle-contribution", deliverableId: plan.members[0]!.deliverableId,
    });
  });
});

describe("eligibility observation bracket", () => {
  it("refuses tracked or index dirt while allowing ignored output", async () => {
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", controlRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, dependencies());
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const deps = dependencies();
    deps.inspectCheckout = vi.fn(async () => ({ head: oid("b"), tree: oid("2"), trackedDirty: true }));
    await expect(verifyDeliveryCandidateCheckout(prepared.snapshot, 0, "/tmp/candidate", deps))
      .resolves.toMatchObject({ status: "refused", reason: "checkout-dirty" });
  });

  it("closes only after exact completeness, plan/ref reobservation, and admissible bindings", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", controlRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toEqual({
      status: "eligible",
      snapshot: prepared.snapshot,
    });
  });

  it("refuses a non-terminal head bound to a foreign member", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", controlRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    deps.resolveMember = vi.fn(async () => ({
      status: "ok" as const,
      value: { planId: "foreign", workUnitId: "other", deliverableId: prepared.snapshot.members[0]!.deliverableId },
    }));
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toMatchObject({
      status: "refused", reason: "head-already-bound", deliverableId: prepared.snapshot.members[0]!.deliverableId,
    });
  });

  it("admits an exact same-member retry and refuses late plan or completeness drift", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", controlRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const first = prepared.snapshot.members[0]!;
    deps.resolveMember = vi.fn(async () => ({ status: "ok" as const, value: {
      planId: prepared.snapshot.planId,
      workUnitId: prepared.snapshot.workUnitId,
      deliverableId: first.deliverableId,
    } }));
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toMatchObject({ status: "eligible" });

    deps.compareNormalizedCompleteness = vi.fn(async () => ({ status: "refused" as const, reason: "dropped" as const }));
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toEqual({
      status: "refused", reason: "completeness-dropped",
    });

    const movedPlanDeps = dependencies();
    movedPlanDeps.readCurrentPlan = vi.fn(async () => null);
    await expect(closeDeliveryEligibility(prepared.snapshot, movedPlanDeps)).resolves.toEqual({
      status: "refused", reason: "plan-moved",
    });
  });
});
