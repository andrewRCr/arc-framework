/** Mechanical eligibility tests for operator-authored delivery candidate chains. */

import { describe, expect, it, vi } from "vitest";

import {
  deliveryPlanFixture,
  deliveryStackPlanFixture,
  deliveryStackPlanWithMemberTitlesFixture,
} from "../../fixtures/delivery-plan.js";
import {
  closeDeliveryEligibility,
  closeDeliveryEligibilityForPublication,
  deriveDeliveryMemberLifecycleRevalidation,
  deriveDeliveryRewriteLifecycleRevalidation,
  executeWithFreshDeliveryEligibility,
  prepareDeliveryEligibility,
  verifyDeliveryCandidateCheckout,
  type DeliveryEligibilityCloseDependencies,
} from "../../../src/lib/delivery/eligibility.js";
import { resolveDeliveryMemberPresentations } from "../../../src/lib/delivery/materialization.js";

const oid = (character: string): string => character.repeat(40);

function dependencies(): DeliveryEligibilityCloseDependencies {
  const coordinates = new Map([
    ["main", { head: oid("a"), tree: oid("1") }],
    [oid("a"), { head: oid("a"), tree: oid("1") }],
    ["control", { head: oid("d"), tree: oid("4") }],
    ["candidate/first", { head: oid("b"), tree: oid("2") }],
    ["candidate/second", { head: oid("c"), tree: oid("4") }],
  ]);
  return {
    observeRef: vi.fn(async (ref: string) => coordinates.get(ref) ?? null),
    readAncestry: vi.fn(async () => "ancestor" as const),
    readOverlap: vi.fn(async () => ({
      status: "available" as const,
      mergeBase: oid("a"),
      overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
    })),
    revalidateLifecycleContribution: vi.fn(async () => ({ status: "ok" as const })),
    resolveLifecyclePaths: vi.fn(async ({ snapshot }) => snapshot.lifecyclePaths),
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

function passedGateResults() {
  return candidates().map((candidate, index) => ({
    deliverableId: candidate.deliverableId,
    head: index === 0 ? oid("b") : oid("c"),
    tree: index === 0 ? oid("2") : oid("4"),
    status: "passed" as const,
  }));
}

describe("prepareDeliveryEligibility", () => {
  it("keeps a standalone rewrite's requested predecessor distinct from the protected base", () => {
    expect(deriveDeliveryRewriteLifecycleRevalidation({
      protectedBaseRef: "main",
      requestedPredecessorHead: oid("b"),
      candidateRef: "candidate/rewrite",
      lifecyclePaths: [".arc/backlog/ROADMAP.md", ".arc/active/meta-delivery-plan-record.md"],
      workUnitId: deliveryStackPlanFixture().workUnitId,
    })).toEqual({
      protectedBaseRef: "main",
      chainBaseRef: oid("b"),
      candidateRef: "candidate/rewrite",
      paths: [".arc/active/meta-delivery-plan-record.md", ".arc/backlog/ROADMAP.md"],
      regenerablePaths: [".arc/backlog/ROADMAP.md"],
    });
  });

  it("preserves distinct observed-tip and chain-base coordinates for disjoint movement", async () => {
    const plan = deliveryStackPlanFixture();
    const deps = dependencies();
    deps.observeRef = vi.fn(async (ref: string) => new Map([
      ["main", { head: oid("e"), tree: oid("5") }],
      ["control", { head: oid("d"), tree: oid("4") }],
      ["candidate/first", { head: oid("b"), tree: oid("2") }],
      ["candidate/second", { head: oid("c"), tree: oid("4") }],
      [oid("a"), { head: oid("a"), tree: oid("1") }],
    ]).get(ref) ?? null);
    deps.readAncestry = vi.fn(async (ancestor, descendant) => (
      ancestor === oid("e") && descendant === oid("b") ? "not-ancestor" as const : "ancestor" as const
    ));

    const prepared = await prepareDeliveryEligibility({
      plan,
      protectedBaseRef: "main",
      topRef: "control",
      candidates: candidates(),
      lifecyclePaths: [".arc/backlog/ROADMAP.md", ".arc/active/meta-delivery-plan-record.md"],
    }, deps);
    expect(prepared).toMatchObject({
      status: "prepared",
      snapshot: {
        protectedBase: { ref: "main", head: oid("e"), tree: oid("5") },
        chainBase: { head: oid("a"), tree: oid("1") },
        predecessorRelation: {
          kind: "disjoint-ahead",
          observedTip: oid("e"),
          chainBase: oid("a"),
          mergeBase: oid("a"),
        },
        regenerablePaths: [".arc/backlog/ROADMAP.md"],
      },
    });
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    expect(deriveDeliveryMemberLifecycleRevalidation({
      snapshot: prepared.snapshot,
      deliverableId: plan.members[0]!.deliverableId,
    })).toEqual({
      protectedBaseRef: "main",
      chainBaseRef: oid("a"),
      candidateRef: "candidate/first",
      paths: [".arc/active/meta-delivery-plan-record.md", ".arc/backlog/ROADMAP.md"],
      regenerablePaths: [".arc/backlog/ROADMAP.md"],
    });
    expect(deriveDeliveryMemberLifecycleRevalidation({
      snapshot: prepared.snapshot,
      deliverableId: plan.members[1]!.deliverableId,
    })).toMatchObject({
      chainBaseRef: oid("b"),
      candidateRef: "candidate/second",
      regenerablePaths: [".arc/backlog/ROADMAP.md"],
    });
    expect(deps.revalidateLifecycleContribution).toHaveBeenCalledWith(expect.objectContaining({
      protectedBaseRef: "main",
      chainBaseRef: oid("a"),
      regenerablePaths: [".arc/backlog/ROADMAP.md"],
    }));
  });

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
    deps.readOverlap = vi.fn(async () => ({
      status: "available" as const,
      mergeBase: oid("a"),
      overlap: {
        status: "available" as const,
        substantivePaths: ["src/shared.ts"],
        regenerablePaths: [],
      },
    }));
    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", topRef: "control", candidates: candidates(), lifecyclePaths: [],
    }, deps)).resolves.toMatchObject({
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: plan.members[0]!.deliverableId,
      relation: {
        kind: "overlapping-ahead",
        observedTip: oid("a"),
        mergeBase: oid("a"),
        overlap: { substantivePaths: ["src/shared.ts"] },
      },
      paths: ["src/shared.ts"],
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
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

  it("distinguishes an unrelated bottom member with an explicit rebuild boundary", async () => {
    const plan = deliveryStackPlanFixture();
    const deps = dependencies();
    deps.readAncestry = vi.fn(async () => "not-ancestor" as const);
    deps.readOverlap = vi.fn(async () => ({
      status: "unrelated" as const,
      leftRevision: oid("b"),
      rightRevision: oid("a"),
      detail: "The revisions have no common ancestor.",
    }));

    await expect(prepareDeliveryEligibility({
      plan, protectedBaseRef: "main", topRef: "control", candidates: candidates(), lifecyclePaths: [],
    }, deps)).resolves.toMatchObject({
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: plan.members[0]!.deliverableId,
      relation: {
        kind: "unrelated",
        observedTip: oid("a"),
        detail: "The revisions have no common ancestor.",
      },
      remedy: { kind: "delivery-authoring-rebuild-required", automatedCommand: null },
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
  it.each([
    ["missing-gate-result", () => passedGateResults().slice(0, 1)],
    ["duplicate-gate-result", () => [passedGateResults()[0]!, passedGateResults()[0]!]],
    ["reordered-gate-result", () => passedGateResults().reverse()],
    ["gate-result-failed", () => passedGateResults().map((result, index) => index === 0
      ? { ...result, status: "failed" as const }
      : result)],
    ["gate-result-stale", () => passedGateResults().map((result, index) => index === 0
      ? { ...result, tree: oid("9") }
      : result)],
  ] as const)("refuses %s evidence before publication mutation", async (reason, makeGateResults) => {
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
      gateResults: makeGateResults(),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => [],
      prepareMutation: async () => ({ status: "prepared" as const, value: undefined }),
      mutate: async () => {
        mutated = true;
        return { status: "mutated" as const };
      },
    });

    expect(result).toMatchObject({ status: "refused", reason });
    expect(mutated).toBe(false);
  });

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
      gateResults: passedGateResults(),
    }, {
      ...deps,
      resolveOriginatingTopRef: async () => "control",
      resolveLifecyclePaths: async () => [],
      prepareMutation: async ({ plan: current }) => {
        const presentations = resolveDeliveryMemberPresentations(current, current.members.slice(0, -1).map(
          (member) => ({ deliverableId: member.deliverableId, summary: `Review ${member.title}.` }),
        ), { type: "feat", breaking: false, description: "publish the work unit" });
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
      gateResults: passedGateResults(),
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
      gateResults: passedGateResults(),
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
      gateResults: passedGateResults().slice(1),
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
      gateResults: passedGateResults(),
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
    await expect(closeDeliveryEligibilityForPublication({
      snapshot: prepared.snapshot,
      gateResults: passedGateResults(),
    }, deps)).resolves.toEqual({ status: "eligible", snapshot: prepared.snapshot });
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
    await expect(closeDeliveryEligibility(prepared.snapshot, deps))
      .resolves.toMatchObject({
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
    await expect(closeDeliveryEligibility(prepared.snapshot, deps))
      .resolves.toMatchObject({
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
    await expect(closeDeliveryEligibility(prepared.snapshot, deps))
      .resolves.toMatchObject({
        status: "refused",
        reason: "source-moved",
        source: {
          ref: "control",
          expected: { head: oid("d"), tree: oid("4") },
          observed: { head: oid("e"), tree: oid("5") },
        },
        nextAction: {
          kind: "reprepare-delivery-eligibility",
          planId: prepared.snapshot.planId,
          protectedBaseRef: "main",
          topRef: "control",
        },
      });
  });

  it.each([false, true])(
    "reobserves refs after awaited close checks when a source moves: %s",
    async (moveSource) => {
      const deps = dependencies();
      const prepared = await prepareDeliveryEligibility({
        plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
        candidates: candidates(), lifecyclePaths: [],
      }, deps);
      if (prepared.status !== "prepared") throw new Error("fixture must prepare");
      const observedRef = deps.observeRef;
      const events: string[] = [];
      deps.compareNormalizedCompleteness = vi.fn(async () => {
        events.push("completeness");
        return { status: "match" as const };
      });
      deps.resolveMember = vi.fn(async () => {
        events.push("binding");
        return { status: "ok" as const, value: null };
      });
      deps.observeRef = vi.fn(async (ref: string) => {
        events.push(`ref:${ref}`);
        return moveSource && ref === "candidate/first"
          ? { head: oid("f"), tree: oid("6") }
          : observedRef(ref);
      });

      const result = await closeDeliveryEligibility(prepared.snapshot, deps);
      if (moveSource) {
        expect(result).toMatchObject({
          status: "refused",
          reason: "source-moved",
          source: { ref: "candidate/first" },
        });
      } else {
        expect(result).toEqual({ status: "eligible", snapshot: prepared.snapshot });
      }
      expect(events.lastIndexOf("ref:candidate/first")).toBeGreaterThan(events.lastIndexOf("binding"));
    },
  );

  it("rejects a caller-altered predecessor relation before completeness", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const completeness = vi.mocked(deps.compareNormalizedCompleteness);
    const tampered = {
      ...prepared.snapshot,
      predecessorRelation: {
        kind: "disjoint-ahead" as const,
        observedTip: prepared.snapshot.protectedBase.head,
        chainBase: oid("f"),
        mergeBase: oid("f"),
        overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
      },
    };

    await expect(closeDeliveryEligibility(tampered, deps)).resolves.toMatchObject({
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: prepared.snapshot.members[0]!.deliverableId,
    });
    expect(completeness).not.toHaveBeenCalled();
  });

  it("rejects a resolvable substituted chain-base coordinate before completeness", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const completeness = vi.mocked(deps.compareNormalizedCompleteness);
    const originalObserve = deps.observeRef;
    deps.observeRef = vi.fn(async (ref: string) => ref === oid("f")
      ? { head: oid("f"), tree: oid("6") }
      : originalObserve(ref));

    await expect(closeDeliveryEligibility({
      ...prepared.snapshot,
      chainBase: { head: oid("f"), tree: oid("6") },
    }, deps)).resolves.toMatchObject({
      status: "refused",
      reason: "wrong-predecessor",
      deliverableId: prepared.snapshot.members[0]!.deliverableId,
    });
    expect(completeness).not.toHaveBeenCalled();
    expect(deps.observeRef).not.toHaveBeenCalledWith(oid("f"));
  });

  it("rejects substituted regenerable-path treatment before completeness", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: [".arc/backlog/ROADMAP.md"],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    const completeness = vi.mocked(deps.compareNormalizedCompleteness);

    await expect(closeDeliveryEligibility({
      ...prepared.snapshot,
      regenerablePaths: [],
    }, deps)).resolves.toEqual({ status: "refused", reason: "lifecycle-paths-moved" });
    expect(completeness).not.toHaveBeenCalled();
  });

  it.each(["lifecyclePaths", "regenerablePaths"] as const)(
    "rejects a caller-altered %s array against a fresh authoritative resolution",
    async (field) => {
      const deps = dependencies();
      const authoritativePaths = [".arc/active/meta-delivery-plan-record.md", ".arc/backlog/ROADMAP.md"];
      const prepared = await prepareDeliveryEligibility({
        plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
        candidates: candidates(), lifecyclePaths: authoritativePaths,
      }, deps);
      if (prepared.status !== "prepared") throw new Error("fixture must prepare");
      deps.resolveLifecyclePaths = vi.fn(async () => authoritativePaths);
      const completeness = vi.mocked(deps.compareNormalizedCompleteness);
      const snapshot = field === "lifecyclePaths"
        ? { ...prepared.snapshot, lifecyclePaths: [".arc/backlog/ROADMAP.md"] }
        : { ...prepared.snapshot, regenerablePaths: [] };

      await expect(closeDeliveryEligibilityForPublication({
        snapshot,
        gateResults: passedGateResults(),
      }, deps)).resolves.toEqual({ status: "refused", reason: "lifecycle-paths-moved" });
      expect(completeness).not.toHaveBeenCalled();
    },
  );

  it("reruns every member lifecycle invariant during publication close", async () => {
    const deps = dependencies();
    const prepared = await prepareDeliveryEligibility({
      plan: deliveryStackPlanFixture(), protectedBaseRef: "main", topRef: "control",
      candidates: candidates(), lifecyclePaths: ["meta.md"],
    }, deps);
    if (prepared.status !== "prepared") throw new Error("fixture must prepare");
    deps.resolveLifecyclePaths = vi.fn(async () => ["meta.md"]);
    deps.revalidateLifecycleContribution = vi.fn(async ({ candidateRef }) => candidateRef === "candidate/second"
      ? { status: "refused" as const, paths: ["meta.md"] }
      : { status: "ok" as const });

    await expect(closeDeliveryEligibilityForPublication({
      snapshot: prepared.snapshot,
      gateResults: passedGateResults(),
    }, deps)).resolves.toEqual({
      status: "refused",
      reason: "lifecycle-contribution",
      deliverableId: prepared.snapshot.members[1]!.deliverableId,
      paths: ["meta.md"],
    });
    expect(deps.revalidateLifecycleContribution).toHaveBeenCalledTimes(2);
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
    await expect(closeDeliveryEligibility(prepared.snapshot, bindingDeps))
      .resolves.toEqual({
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
    await expect(closeDeliveryEligibility(prepared.snapshot, deps))
      .resolves.toMatchObject({ status: "eligible" });

    deps.compareNormalizedCompleteness = vi.fn(async () => ({ status: "refused" as const, reason: "dropped" as const }));
    await expect(closeDeliveryEligibility(prepared.snapshot, deps))
      .resolves.toEqual({
      status: "refused", reason: "completeness-dropped",
    });

    const movedPlanDeps = dependencies();
    movedPlanDeps.readCurrentPlan = vi.fn(async () => null);
    await expect(closeDeliveryEligibility(prepared.snapshot, movedPlanDeps)).resolves.toEqual({
      status: "refused", reason: "plan-moved",
    });
  });
});
