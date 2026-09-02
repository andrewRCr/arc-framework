/** Mechanical eligibility tests for operator-authored delivery candidate chains. */

import { describe, expect, it, vi } from "vitest";

import {
  deliveryPlanFixture,
  deliveryStackPlanFixture,
  deliveryStackPlanWithMemberTitlesFixture,
} from "../../fixtures/delivery-plan.js";
import {
  closeDeliveryEligibility,
  executeWithFreshDeliveryEligibility,
  prepareDeliveryEligibility,
  verifyDeliveryCandidateCheckout,
  type DeliveryEligibilityDependencies,
} from "../../../src/lib/delivery/eligibility.js";
import { resolveDeliveryMemberPresentations } from "../../../src/lib/delivery/materialization.js";

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
    inspectCheckout: vi.fn(async (path: string) => path.endsWith("second")
      ? { head: oid("c"), tree: oid("4"), trackedDirty: false }
      : { head: oid("b"), tree: oid("2"), trackedDirty: false }),
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
      topRef: "control",
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
      topRef: "control",
      candidates: candidates(),
      lifecyclePaths: [".arc/active/meta-delivery-plan-record.md"],
    }, dependencies());

    expect(result).toMatchObject({
      status: "prepared",
      snapshot: {
        planRevision: 1,
        protectedBase: { ref: "main", head: oid("a"), tree: oid("1") },
        top: { ref: "control", head: oid("d"), tree: oid("4") },
        members: [
          { ref: "candidate/first", head: oid("b"), tree: oid("2") },
          { ref: "candidate/second", head: oid("c"), tree: oid("4") },
        ],
      },
    });
  });

  it.each([
    ["missing-candidate", () => candidates().slice(0, 1)],
    ["extra-candidate", () => [...candidates(), { deliverableId: "extra", ref: "candidate/extra" }]],
    ["duplicate-candidate", () => [candidates()[0]!, candidates()[0]!]],
    ["reordered-candidate", () => candidates().reverse()],
  ] as const)("refuses %s membership", async (reason, makeCandidates) => {
    const result = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(),
      protectedBaseRef: "main",
      topRef: "control",
      candidates: makeCandidates(),
      lifecyclePaths: [],
    }, dependencies());
    expect(result).toMatchObject({ status: "refused", reason });
  });

  it("keeps authoring candidates outside the published delivery namespace", async () => {
    const plan = deliveryStackPlanFixture();
    const direct = candidates().map((candidate, index) => index === 0
      ? { ...candidate, ref: `refs/heads/delivery/${plan.workUnitId}/first` }
      : candidate);

    await expect(prepareDeliveryEligibility({
      plan,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: direct,
      lifecyclePaths: [],
    }, dependencies())).resolves.toEqual({
      status: "refused",
      reason: "direct-delivery-ref",
      deliverableId: plan.members[0]!.deliverableId,
    });
  });

  it("names a candidate whose ancestry or lifecycle facts refuse", async () => {
    const plan = deliveryStackPlanFixture();
    const deps = dependencies();
    deps.readAncestry = vi.fn(async () => "not-ancestor" as const);
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", topRef: "control", candidates: candidates(), lifecyclePaths: [],
    }, deps)).resolves.toEqual({
      status: "refused", reason: "wrong-predecessor", deliverableId: plan.members[0]!.deliverableId,
    });

    const lifecycleDeps = dependencies();
    lifecycleDeps.revalidateLifecycleContribution = vi.fn(async () => (
      { status: "refused" as const, paths: ["meta.md", "notes.md"] as const }
    ));
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", topRef: "control", candidates: candidates(),
      lifecyclePaths: ["meta.md", "notes.md"],
    }, lifecycleDeps)).resolves.toEqual({
      status: "refused", reason: "lifecycle-contribution", deliverableId: plan.members[0]!.deliverableId,
      paths: ["meta.md", "notes.md"],
    });
  });

  it("refuses an empty non-terminal candidate by exact head or tree identity", async () => {
    const plan = deliveryStackPlanFixture();
    const deps = dependencies();
    deps.observeRef = vi.fn(async (ref: string) => new Map([
      ["main", { head: oid("a"), tree: oid("1") }],
      ["control", { head: oid("d"), tree: oid("4") }],
      ["candidate/first", { head: oid("a"), tree: oid("1") }],
      ["candidate/second", { head: oid("c"), tree: oid("4") }],
    ]).get(ref) ?? null);
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", topRef: "control", candidates: candidates(), lifecyclePaths: [],
    }, deps)).resolves.toEqual({
      status: "refused", reason: "empty-candidate", deliverableId: plan.members[0]!.deliverableId,
    });
  });
});

describe("eligibility observation bracket", () => {
  it("refuses malformed effective presentations before any publication mutation", async () => {
    const malformed = deliveryStackPlanWithMemberTitlesFixture([
      "Member title\nwith a second line",
      "Second member",
    ]);
    const deps = dependencies();
    deps.readCurrentPlan = vi.fn(async () => malformed);
    const mutations = { refs: false, state: false, host: false };

    const result = await executeWithFreshDeliveryEligibility({
      planId: malformed.planId,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: candidates().map((candidate, index) => ({
        ...candidate,
        checkoutPath: `/tmp/${index === 0 ? "first" : "second"}`,
      })),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => [],
      prepareMutation: async ({ plan: current }) => {
        const presentations = resolveDeliveryMemberPresentations(current, current.members.slice(0, -1).map(
          (member) => ({ deliverableId: member.deliverableId, summary: `Review ${member.title}.` }),
        ));
        return presentations.status === "resolved"
          ? { status: "prepared" as const, value: presentations.value }
          : presentations;
      },
      mutate: async () => {
        mutations.refs = true;
        mutations.state = true;
        mutations.host = true;
        return { status: "mutated" as const };
      },
    });

    expect(result).toEqual({ status: "refused", reason: "presentation-mismatch" });
    expect(mutations).toEqual({ refs: false, state: false, host: false });
  });

  it("refuses mutation when the requested top is not the repository-owned work-unit branch", async () => {
    const deps = dependencies();
    let mutated = false;

    const result = await executeWithFreshDeliveryEligibility({
      planId: deliveryStackPlanFixture().planId,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: candidates().map((candidate, index) => ({
        ...candidate,
        checkoutPath: `/tmp/${index === 0 ? "first" : "second"}`,
      })),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "refs/heads/feat/example",
      resolveLifecyclePaths: async () => [],
      prepareMutation: async () => ({ status: "prepared" as const, value: undefined }),
      mutate: async () => {
        mutated = true;
        return { status: "mutated" as const };
      },
    });

    expect(result).toEqual({ status: "refused", reason: "top-ref-mismatch" });
    expect(mutated).toBe(false);
  });

  it("refuses mutation when the current lifecycle path set moves during revalidation", async () => {
    const deps = dependencies();
    let readCount = 0;
    let mutated = false;

    const result = await executeWithFreshDeliveryEligibility({
      planId: deliveryStackPlanFixture().planId,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: candidates().map((candidate, index) => ({
        ...candidate,
        checkoutPath: `/tmp/${index === 0 ? "first" : "second"}`,
      })),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => ++readCount === 1 ? ["meta.md"] : ["meta.md", "tasks.md"],
      prepareMutation: async () => ({ status: "prepared" as const, value: undefined }),
      mutate: async () => {
        mutated = true;
        return { status: "mutated" as const };
      },
    });

    expect(result).toEqual({ status: "refused", reason: "lifecycle-paths-moved" });
    expect(mutated).toBe(false);
  });

  it("preserves a suffix member offset through preparation and mutation", async () => {
    const plan = deliveryStackPlanFixture();
    const suffix = candidates().slice(1).map((candidate) => ({
      ...candidate,
      checkoutPath: "/tmp/second",
    }));
    const deps = dependencies();
    const prepareMutation = vi.fn(async () => ({ status: "prepared" as const, value: "prepared-suffix" }));
    const mutate = vi.fn(async () => ({ status: "mutated" as const }));

    await expect(executeWithFreshDeliveryEligibility({
      planId: plan.planId,
      protectedBaseRef: "main",
      topRef: "control",
      memberOffset: 1,
      candidates: suffix,
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => [],
      prepareMutation,
      mutate,
    })).resolves.toEqual({ status: "mutated" });

    const expectedMember = expect.objectContaining({
      deliverableId: plan.members[1]!.deliverableId,
      ref: "candidate/second",
    });
    expect(prepareMutation).toHaveBeenCalledWith({
      plan,
      snapshot: expect.objectContaining({ members: [expectedMember] }),
    });
    expect(mutate).toHaveBeenCalledWith({
      plan,
      snapshot: expect.objectContaining({ members: [expectedMember] }),
      prepared: "prepared-suffix",
    });
  });

  it("refuses mutation when a post-gate candidate checkout moved", async () => {
    const deps = dependencies();
    let mutated = false;
    deps.inspectCheckout = vi.fn(async (path: string) => path.endsWith("first")
      ? { head: oid("e"), tree: oid("5"), trackedDirty: false }
      : { head: oid("c"), tree: oid("4"), trackedDirty: false });

    await expect(executeWithFreshDeliveryEligibility({
      planId: deliveryStackPlanFixture().planId,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: candidates().map((candidate, index) => ({
        ...candidate,
        checkoutPath: `/tmp/${index === 0 ? "first" : "second"}`,
      })),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => [],
      prepareMutation: async () => ({ status: "prepared" as const, value: undefined }),
      mutate: async () => {
        mutated = true;
        return { status: "mutated" as const };
      },
    })).resolves.toMatchObject({ status: "refused", reason: "checkout-moved" });
    expect(mutated).toBe(false);
  });

  it("refuses a candidate checkout reported as tracked-dirty", async () => {
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, dependencies());
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const deps = dependencies();
    deps.inspectCheckout = vi.fn(async () => ({ head: oid("b"), tree: oid("2"), trackedDirty: true }));
    await expect(verifyDeliveryCandidateCheckout(prepared.snapshot, 0, "/tmp/candidate", deps))
      .resolves.toMatchObject({ status: "refused", reason: "checkout-dirty" });
  });

  it("refuses unavailable candidate-checkout evidence", async () => {
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, dependencies());
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const deps = dependencies();
    deps.inspectCheckout = vi.fn(async () => null);
    await expect(verifyDeliveryCandidateCheckout(prepared.snapshot, 0, "/tmp/candidate", deps))
      .resolves.toMatchObject({
        status: "refused",
        reason: "evidence-unavailable",
        deliverableId: prepared.snapshot.members[0]!.deliverableId,
      });
  });

  it("closes only after exact completeness, plan/ref reobservation, and admissible bindings", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
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
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
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

  it("refuses a final candidate head bound to a foreign member", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const finalMember = prepared.snapshot.members.at(-1)!;
    deps.resolveMember = vi.fn(async (head: string) => ({
      status: "ok" as const,
      value: head === finalMember.head
        ? { planId: "foreign", workUnitId: "other", deliverableId: finalMember.deliverableId }
        : null,
    }));
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toMatchObject({
      status: "refused", reason: "head-already-bound", deliverableId: finalMember.deliverableId,
    });
  });

  it("refuses moved source coordinates during close", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    deps.observeRef = vi.fn(async (ref: string) => new Map([
      ["main", { head: oid("a"), tree: oid("1") }],
      ["control", { head: oid("e"), tree: oid("5") }],
      ["candidate/first", { head: oid("b"), tree: oid("2") }],
      ["candidate/second", { head: oid("c"), tree: oid("4") }],
    ]).get(ref) ?? null);
    await expect(closeDeliveryEligibility(prepared.snapshot, deps)).resolves.toEqual({
      status: "refused", reason: "source-moved",
    });
  });

  it("maps unavailable ancestry and binding evidence to evidence-unavailable", async () => {
    const ancestryDeps = dependencies();
    ancestryDeps.readAncestry = vi.fn(async () => "unresolvable" as const);
    await expect(prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, ancestryDeps)).resolves.toMatchObject({ status: "refused", reason: "evidence-unavailable" });

    const bindingDeps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, bindingDeps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    bindingDeps.resolveMember = vi.fn(async () => ({ status: "refused" as const }));
    await expect(closeDeliveryEligibility(prepared.snapshot, bindingDeps)).resolves.toEqual({
      status: "refused", reason: "evidence-unavailable",
    });
  });

  it("admits an exact same-member retry and refuses late plan or completeness drift", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const first = prepared.snapshot.members[0]!;
    deps.resolveMember = vi.fn(async (head: string) => ({
      status: "ok" as const,
      value: head === first.head ? {
        planId: prepared.snapshot.planId,
        workUnitId: prepared.snapshot.workUnitId,
        deliverableId: first.deliverableId,
      } : null,
    }));
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
