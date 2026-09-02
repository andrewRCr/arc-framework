import { describe, expect, it, vi } from "vitest";

import {
  classifyDeliveryProviderRefreshPublication,
  deriveDeliveryProviderRefreshCandidates,
  executeDeliveryProviderRefresh,
} from "../../../src/lib/delivery/provider-refresh-execution.js";
import type { DeliveryOperationSnapshotV1, DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { deriveDeliveryProviderRefreshSubject } from
  "../../../src/lib/delivery/provider-refresh-observation.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const oid = (digit: string): string => digit.repeat(40);
const exactTargetAncestry = async (
  ancestor: string,
  descendant: string,
): Promise<"ancestor" | "not-ancestor"> => ancestor === descendant ? "ancestor" : "not-ancestor";
const readyTop = async () => ({ status: "ready" as const });
const clearMemberRefCheckouts = async () => ({ status: "observed" as const, checkouts: [] });

function positionFacts(state: ReturnType<typeof deliveryStateFixture>, landedDeliverableIds: string[] = []) {
  return { target: state.target, members: state.members, landedDeliverableIds };
}

function snapshot(heads: readonly string[]): DeliveryOperationSnapshotV1 {
  return {
    target: {
      ref: "refs/heads/main",
      coordinates: { head: oid("1"), tree: oid("2") },
    },
    members: heads.map((head, index) => ({
      deliverableId: `sha256:${String(index + 1).repeat(64)}`,
      ref: `refs/heads/delivery/example/member-${index + 1}`,
      changeRequest: { providerId: "github", changeRequestId: String(100 + index) },
      coordinates: {
        base: index === 0 ? oid("1") : heads[index - 1] ?? oid("1"),
        head,
        tree: oid(String(index + 3)),
      },
    })),
  };
}

function reservedRefreshTargetMovementFixture() {
  const plan = deliveryFourMemberStackPlanFixture();
  const fixture = deliveryStateFixture(plan);
  const state = {
    ...fixture,
    members: fixture.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(500 + index) },
    })),
  };
  const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts: positionFacts(state) });
  if (derived.status !== "derived") throw new Error("refresh subject must derive");
  const before = derived.subject.before;
  const requestedTarget = {
    ref: before.target!.ref,
    coordinates: { head: oid("a"), tree: oid("1") },
  };
  const requested: DeliveryOperationSnapshotV1 = {
    target: requestedTarget,
    members: before.members.map((member, index) => ({
      ...member,
      coordinates: member.coordinates === null ? null : {
        base: index === 0 ? requestedTarget.coordinates.head : oid(String(index + 6)),
        head: oid(String(index + 7)),
        tree: oid(String(index + 3)),
      },
    })),
  };
  const operationId = "provider-refresh-target-advance";
  const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
    operationId,
    kind: "rewrite",
    mode: "provider-refresh",
    affectedDeliverableIds: before.members.map(({ deliverableId }) => deliverableId),
    expectedStateRevision: 7,
    before,
    requested,
  });
  if (reserved.status !== "reserved") throw new Error("refresh must reserve");
  const liveTarget = {
    ref: requestedTarget.ref,
    coordinates: { head: oid("b"), tree: oid("c") },
  };
  const observed: DeliveryOperationSnapshotV1 = {
    target: liveTarget,
    members: requested.members.map((member, index) => ({
      ...member,
      coordinates: member.coordinates === null ? null : {
        ...member.coordinates,
        base: index === 0
          ? liveTarget.coordinates.head
          : requested.members[index - 1]!.coordinates!.head,
      },
    })),
  };
  return { plan, before, requested, operationId, reserved, liveTarget, observed };
}

describe("provider refresh publication classification", () => {
  it("accepts only all-before, one requested prefix, or all-requested", () => {
    const before = snapshot([oid("4"), oid("5"), oid("6")]);
    const requested = snapshot([oid("7"), oid("8"), oid("9")]);
    const observation = (heads: readonly (string | null)[]) => heads.map((head, index) => ({
      deliverableId: before.members[index]?.deliverableId ?? "",
      head,
    }));

    expect(classifyDeliveryProviderRefreshPublication({
      before,
      requested,
      observed: observation([oid("4"), oid("5"), oid("6")]),
    })).toEqual({ status: "retry", pendingDeliverableIds: before.members.map(({ deliverableId }) => deliverableId) });

    expect(classifyDeliveryProviderRefreshPublication({
      before,
      requested,
      observed: observation([oid("7"), oid("8"), oid("6")]),
    })).toEqual({
      status: "partial-published",
      publishedDeliverableIds: before.members.slice(0, 2).map(({ deliverableId }) => deliverableId),
      pendingDeliverableIds: before.members.slice(2).map(({ deliverableId }) => deliverableId),
    });

    expect(classifyDeliveryProviderRefreshPublication({
      before,
      requested,
      observed: observation([oid("7"), oid("8"), oid("9")]),
    })).toEqual({ status: "published" });

    for (const heads of [
      [oid("4"), oid("8"), oid("6")],
      [oid("7"), oid("5"), oid("9")],
      [oid("7"), oid("0"), oid("6")],
      [oid("7"), null, oid("6")],
    ]) {
      expect(classifyDeliveryProviderRefreshPublication({
        before,
        requested,
        observed: observation(heads),
      })).toEqual({ status: "blocked", reason: "ambiguous-result" });
    }
  });

  it("derives private candidate refs only for changed planned members", () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const before = snapshot([oid("4"), oid("5"), oid("6")]);
    const requested = snapshot([oid("4"), oid("8"), oid("9")]);
    const planBoundBefore = {
      ...before,
      members: before.members.map((member, index) => ({
        ...member,
        deliverableId: plan.members[index]?.deliverableId ?? member.deliverableId,
      })),
    };
    const planBoundRequested = {
      ...requested,
      members: requested.members.map((member, index) => ({
        ...member,
        deliverableId: plan.members[index]?.deliverableId ?? member.deliverableId,
      })),
    };

    expect(deriveDeliveryProviderRefreshCandidates({
      plan,
      before: planBoundBefore,
      requested: planBoundRequested,
    })).toEqual({
      status: "derived",
      candidates: plan.members.slice(1, 3).map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: `refs/arc/delivery-refresh-candidates/${plan.planId}/${member.chunkKey}`,
        head: [oid("8"), oid("9")][index],
      })),
    });
  });

  it("checks terminal readiness before reserving or publishing a prepared refresh", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(180 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state);
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const requested: DeliveryOperationSnapshotV1 = {
      target: before.target,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? targetHead : oid(String(index + 6)),
          head: oid(String(index + 7)),
          tree: oid(String(index + 3)),
        },
      })),
    };
    const candidateResult = deriveDeliveryProviderRefreshCandidates({ plan, before, requested });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    const candidateRefs = new Set(candidateResult.candidates.map(({ ref }) => ref));
    let current: { revision: number; value: DeliveryStateV1 } = { revision: 7, value: state };
    let memberPublished = false;
    const dependencies = {
      preparation: { prepare: async () => ({
        status: "prepared" as const,
        observation: { snapshot: requested, targetMovement: "exact" as const },
        candidates: candidateResult.candidates,
      }) },
      preflightTop: async () => ({ status: "refused" as const, reason: "worktree-dirty" as const }),
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => before.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      rewriteMemberRef: async () => {
        memberPublished = true;
        return { status: "rewritten" as const };
      },
      observeResult: async () => ({
        status: "observed" as const,
        observation: { snapshot: requested, targetMovement: "exact" as const },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted" as const, proof: "mechanical-reapply" as const }),
      absorbTop: async () => ({ status: "absorbed" as const, head: oid("a"), tree: oid("b") }),
      publishTop: async () => ({ status: "published" as const }),
      rewriteLocalRef: async () => ({ status: "adopted" as const }),
      cleanupPreparedCandidates: async (candidates: readonly { readonly ref: string }[]) => {
        for (const candidate of candidates) candidateRefs.delete(candidate.ref);
        return { status: "cleaned" as const };
      },
      stateStore: { publish: async (_planId: string, value: DeliveryStateV1, revision: number) => {
        current = { revision: revision + 1, value };
        return { status: "ok" as const, value: current };
      } },
    };

    await expect(executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts,
    }, dependencies)).resolves.toEqual({ status: "refused", reason: "worktree-dirty" });
    expect(current).toEqual({ revision: 7, value: state });
    expect(memberPublished).toBe(false);
    expect(candidateRefs.size).toBe(0);
  });

  it("refuses checked-out changed member refs before reserving or publishing", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(185 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state);
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const requested: DeliveryOperationSnapshotV1 = {
      target: before.target,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? targetHead : oid(String(index + 6)),
          head: oid(String(index + 7)),
          tree: oid(String(index + 3)),
        },
      })),
    };
    const candidateResult = deriveDeliveryProviderRefreshCandidates({ plan, before, requested });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    const checkedOutMember = requested.members[1]!;
    let statePublished = false;
    let memberPublished = false;
    let candidatesCleaned = false;
    const dependencies = {
      preparation: { prepare: async () => ({
        status: "prepared" as const,
        observation: { snapshot: requested, targetMovement: "exact" as const },
        candidates: candidateResult.candidates,
      }) },
      preflightTop: readyTop,
      observeMemberRefCheckouts: async (refs: readonly string[]) => ({
        status: "observed" as const,
        checkouts: [{ ref: refs.find((ref) => ref === checkedOutMember.ref)!, path: "/tmp/member-seven" }],
      }),
      observePublishedHeads: async () => before.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      rewriteMemberRef: async () => {
        memberPublished = true;
        return { status: "rewritten" as const };
      },
      observeResult: async () => ({
        status: "observed" as const,
        observation: { snapshot: requested, targetMovement: "exact" as const },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted" as const, proof: "mechanical-reapply" as const }),
      absorbTop: async () => ({ status: "absorbed" as const, head: oid("a"), tree: oid("b") }),
      publishTop: async () => ({ status: "published" as const }),
      rewriteLocalRef: async () => ({ status: "adopted" as const }),
      cleanupPreparedCandidates: async () => {
        candidatesCleaned = true;
        return { status: "cleaned" as const };
      },
      stateStore: { publish: async () => {
        statePublished = true;
        return { status: "refused" as const, reason: "version-conflict" as const };
      } },
    };

    await expect(executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts,
    }, dependencies)).resolves.toEqual({
      status: "refused",
      reason: "member-ref-checked-out",
      paths: ["/tmp/member-seven"],
    });
    expect({ statePublished, memberPublished, candidatesCleaned }).toEqual({
      statePublished: false,
      memberPublished: false,
      candidatesCleaned: true,
    });
  });

  it("promotes a prepared natural-merge conflict to the attended conflict contract", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(190 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state);
    const conflictPreparation = {
      topRef: state.members[1]!.ref!,
      logicalMergeBase: oid("4"),
      parents: { top: oid("5"), refreshedPredecessor: oid("6") },
      mergeTree: {
        argv: [
          "git", "merge-tree", "--write-tree", "--merge-base", oid("4"),
          "--name-only", "-z", "--no-messages", oid("5"), oid("6"),
        ],
      },
    } as const;

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts,
    }, {
      preparation: { prepare: async () => ({
        status: "refused" as const,
        reason: "content-conflict",
        paths: ["conflicted.ts"],
        conflictPreparation,
      }) },
      preflightTop: async () => { throw new Error("must not preflight"); },
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => { throw new Error("must not observe"); },
      rewriteMemberRef: async () => { throw new Error("must not publish"); },
      observeResult: async () => { throw new Error("must not settle"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish top"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite locally"); },
      cleanupPreparedCandidates: async () => { throw new Error("must not clean"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "content-conflict",
      paths: ["conflicted.ts"],
      conflictPreparation,
    });
  });

  it("identifies a retained reservation and its recovery action on a later block", async () => {
    const { plan, operationId, reserved } = reservedRefreshTargetMovementFixture();
    const active = reserved.state.activeOperation;
    if (active === null) throw new Error("refresh must remain reserved");
    const candidateResult = deriveDeliveryProviderRefreshCandidates({
      plan,
      before: active.before,
      requested: active.requested,
    });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare"); } },
      preflightTop: async () => ({ status: "ready" as const }),
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => { throw new Error("observation failed"); },
      rewriteMemberRef: async () => { throw new Error("must not publish"); },
      observeResult: async () => { throw new Error("must not settle"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish top"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite locally"); },
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "observation-unavailable",
      operationId,
      nextAction: "reconcile",
      recommendedActionText:
        "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
    });
  });

  it("preserves a retained reservation when a changed member ref becomes checked out", async () => {
    const { plan, operationId, reserved } = reservedRefreshTargetMovementFixture();
    const active = reserved.state.activeOperation;
    if (active === null) throw new Error("refresh must remain reserved");
    const candidateResult = deriveDeliveryProviderRefreshCandidates({
      plan,
      before: active.before,
      requested: active.requested,
    });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    let publicationObserved = false;
    let candidatesCleaned = false;

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare"); } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: async (refs) => ({
        status: "observed",
        checkouts: [{ ref: refs[0]!, path: "/tmp/new-member-checkout" }],
      }),
      observePublishedHeads: async () => {
        publicationObserved = true;
        return [];
      },
      rewriteMemberRef: async () => { throw new Error("must not publish"); },
      observeResult: async () => { throw new Error("must not settle"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish top"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite locally"); },
      cleanupPreparedCandidates: async () => {
        candidatesCleaned = true;
        return { status: "cleaned" };
      },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "member-ref-checked-out",
      paths: ["/tmp/new-member-checkout"],
      operationId,
      nextAction: "reconcile",
      recommendedActionText:
        "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
    });
    expect({ publicationObserved, candidatesCleaned }).toEqual({
      publicationObserved: false,
      candidatesCleaned: false,
    });
  });

  it("recovers after candidate cleanup completes before the final state write", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const fixtureTargetHead = fixture.target?.coordinates?.head;
    if (fixtureTargetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(200 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? fixtureTargetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state, [state.members[0]!.deliverableId]);
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const targetHead = before.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("target must be bound");
    const requested: DeliveryOperationSnapshotV1 = {
      target: before.target,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? targetHead : oid(String(index + 6)),
          head: oid(String(index + 7)),
          tree: oid(String(index + 3)),
        },
      })),
    };
    const candidateResult = deriveDeliveryProviderRefreshCandidates({ plan, before, requested });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    const remoteHeads = new Map(before.members.map((member) => [member.deliverableId, member.coordinates!.head]));
    const candidateRefs = new Set(candidateResult.candidates.map(({ ref }) => ref));
    const events: string[] = [];
    let current: { revision: number; value: DeliveryStateV1 } = { revision: 7, value: state };
    let rejectFinalStateOnce = true;

    const dependencies: Parameters<typeof executeDeliveryProviderRefresh>[1] = {
      preparation: { prepare: async () => {
        events.push("prepare");
        return {
          status: "prepared",
          observation: { snapshot: requested, targetMovement: "exact" },
          candidates: candidateResult.candidates,
        };
      } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (snapshot) => snapshot.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: remoteHeads.get(member.deliverableId) ?? null,
      })),
      rewriteMemberRef: async ({ ref, requestedHead }) => {
        const member = requested.members.find((candidate) => candidate.ref === ref)!;
        events.push(`rewrite:${member.deliverableId}`);
        remoteHeads.set(member.deliverableId, requestedHead);
        return { status: "rewritten" };
      },
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: requested, targetMovement: "exact" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }) => {
        events.push(`prove:${deliverableId}`);
        return { status: "accepted", proof: "mechanical-reapply" };
      },
      absorbTop: async () => {
        events.push("absorb");
        return { status: "absorbed", head: oid("a"), tree: oid("b") };
      },
      publishTop: async () => {
        events.push("publish-top");
        return { status: "published" };
      },
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async (candidates) => {
        events.push("cleanup");
        for (const candidate of candidates) candidateRefs.delete(candidate.ref);
        return { status: "cleaned" };
      },
      stateStore: { publish: async (_planId, value, revision) => {
        events.push(value.activeOperation === null ? "final" : "reserve");
        if (revision !== current.revision || (value.activeOperation === null && rejectFinalStateOnce)) {
          rejectFinalStateOnce = false;
          return { status: "refused", reason: "version-conflict" };
        }
        current = { revision: revision + 1, value };
        return { status: "ok", value: current };
      } },
    };

    const interrupted = await executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts,
    }, dependencies);
    expect(interrupted).toMatchObject({
      status: "blocked",
      reason: "state-conflict",
      nextAction: "reconcile",
      recommendedActionText:
        "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
    });
    expect(candidateRefs.size).toBe(0);
    const operationId = current.value.activeOperation?.operationId;
    if (operationId === undefined) throw new Error("provider refresh must remain reserved");

    const result = await executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      operationId,
    }, dependencies);

    expect(result.status).toBe("applied");
    expect(current.value.activeOperation).toBeNull();
    expect(events.filter((event) => event === "cleanup")).toHaveLength(2);
    expect(events.filter((event) => event === "final")).toHaveLength(2);
    expect(events.filter((event) => event === "prepare")).toHaveLength(1);
    expect(events.indexOf("reserve")).toBeLessThan(events.indexOf(`rewrite:${before.members[0]!.deliverableId}`));
    expect(events.slice(-4)).toEqual(["absorb", "publish-top", "cleanup", "final"]);
  });

  it("keeps the selected prefix fixed across append-only target movement", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(225 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0
            ? targetHead
            : index === 1
              ? member.coordinates.base
              : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state);
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const target = before.target;
    if (target === null || target.coordinates === null) throw new Error("target must be bound");
    const selected = before.members[0]!;
    const advancedTarget = {
      ref: target.ref,
      coordinates: { head: oid("a"), tree: oid("b") },
    };
    const requested: DeliveryOperationSnapshotV1 = {
      target: advancedTarget,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0
            ? advancedTarget.coordinates.head
            : index === 1
              ? selected.coordinates!.head
              : oid(String(index + 6)),
          head: index === 0 ? member.coordinates.head : oid(String(index + 7)),
          tree: index === 0 ? member.coordinates.tree : oid(String(index + 3)),
        },
      })),
    };
    const candidateResult = deriveDeliveryProviderRefreshCandidates({ plan, before, requested });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    const remoteHeads = new Map(before.members.map((member) => [
      member.deliverableId,
      member.coordinates!.head,
    ]));
    const rewritten: string[] = [];
    const proved: string[] = [];
    let current: { revision: number; value: DeliveryStateV1 } = { revision: 7, value: state };

    const result = await executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId: selected.deliverableId },
      facts,
    }, {
      preparation: { prepare: async () => ({
        status: "prepared",
        observation: { snapshot: requested, targetMovement: "append-only" },
        candidates: candidateResult.candidates,
      }) },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (snapshot) => snapshot.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: remoteHeads.get(member.deliverableId) ?? null,
      })),
      rewriteMemberRef: async ({ ref, requestedHead }) => {
        const member = requested.members.find((candidate) => candidate.ref === ref)!;
        rewritten.push(member.deliverableId);
        remoteHeads.set(member.deliverableId, requestedHead);
        return { status: "rewritten" };
      },
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: requested, targetMovement: "append-only" },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async ({ deliverableId }) => {
        proved.push(deliverableId);
        if (deliverableId === selected.deliverableId) {
          return { status: "refused", reason: "contribution-diverged", paths: ["base-only-prefix"] };
        }
        return { status: "accepted", proof: "mechanical-reapply" };
      },
      absorbTop: async () => ({ status: "absorbed", head: oid("c"), tree: oid("d") }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async (_planId, value, revision) => {
        if (revision !== current.revision) return { status: "refused", reason: "version-conflict" };
        current = { revision: revision + 1, value };
        return { status: "ok", value: current };
      } },
    });

    if (result.status !== "applied") {
      throw new Error(JSON.stringify({ result, rewritten, proved, current }));
    }
    expect(result).toMatchObject({
      nextAction: "verify-review-fix",
      state: {
        value: {
          target: advancedTarget,
          pendingReviewFixVerification: {
            selectedDeliverableId: selected.deliverableId,
          },
        },
      },
    });
    expect(rewritten).toEqual(before.members.slice(1).map(({ deliverableId }) => deliverableId));
    const provedIds = before.members.slice(1).map(({ deliverableId }) => deliverableId);
    expect(proved).toEqual([...provedIds, ...provedIds]);
    expect(result.state.value.members[0]?.coordinates).toMatchObject({
      base: advancedTarget.coordinates.head,
      head: selected.coordinates!.head,
      tree: selected.coordinates!.tree,
    });
  });

  it("refuses dependent refresh when the selected member has not published a correction", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(600 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const selectedDeliverableId = state.members[0]!.deliverableId;

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId },
      facts: positionFacts(state),
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare"); } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => { throw new Error("must not observe publication"); },
      rewriteMemberRef: async () => { throw new Error("must not rewrite"); },
      observeResult: async () => { throw new Error("must not observe result"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite locally"); },
      cleanupPreparedCandidates: async () => { throw new Error("must not clean up"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("refuses complete-remainder refresh while a selected correction awaits dependent refresh", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const selectedHead = oid("f");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(700 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
          head: index === 0 ? selectedHead : member.coordinates.head,
        },
      })),
    };

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts: positionFacts(state),
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare"); } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => { throw new Error("must not observe publication"); },
      rewriteMemberRef: async () => { throw new Error("must not rewrite"); },
      observeResult: async () => { throw new Error("must not observe result"); },
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => { throw new Error("must not prove"); },
      absorbTop: async () => { throw new Error("must not absorb"); },
      publishTop: async () => { throw new Error("must not publish"); },
      rewriteLocalRef: async () => { throw new Error("must not rewrite locally"); },
      cleanupPreparedCandidates: async () => { throw new Error("must not clean up"); },
      stateStore: { publish: async () => { throw new Error("must not persist"); } },
    });

    expect(result).toEqual({ status: "refused", reason: "selected-member-invalid" });
  });

  it("retains a local terminal-authoring top and its remote lease through provider-refresh recovery", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(250 + index) },
        coordinates: {
          ...member.coordinates!,
          base: index === 0
            ? fixture.target!.coordinates!.head
            : fixture.members[index - 1]!.coordinates!.head,
          head: index === fixture.members.length - 2 ? oid("e") : member.coordinates!.head,
        },
      })),
    };
    const terminal = state.members.at(-1)!;
    const remoteLeaseHead = oid("9");
    const liveTop = {
      base: terminal.coordinates!.base,
      head: oid("c"),
      tree: oid("d"),
    };
    const facts = {
      ...positionFacts(state),
      terminalAuthoringMovement: {
        deliverableId: terminal.deliverableId,
        before: terminal.coordinates!,
        after: liveTop,
        publicationLeaseHead: remoteLeaseHead,
      },
    };
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const selectedDeliverableId = derived.subject.affectedDeliverableIds.at(-1)!;
    let current = { revision: 7, value: state };
    const stateStore = {
      publish: async (_planId: string, value: typeof state, revision: number) => {
        if (revision !== current.revision) {
          return { status: "refused" as const, reason: "version-conflict" as const };
        }
        current = { revision: revision + 1, value };
        return { status: "ok" as const, value: current };
      },
    };
    const dependencies = {
      preparation: { prepare: async () => {
        throw new Error("must not prepare an empty dependent suffix");
      } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (snapshot: DeliveryOperationSnapshotV1) => snapshot.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      rewriteMemberRef: async () => ({ status: "rewritten" as const }),
      observeResult: async () => ({
        status: "observed" as const,
        observation: { snapshot: derived.subject.before, targetMovement: "exact" as const },
      }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted" as const, proof: "mechanical-reapply" as const }),
      publishTop: async ({ beforeHead }: { readonly beforeHead: string }) => {
        expect(beforeHead).toBe(remoteLeaseHead);
        return { status: "published" as const };
      },
      rewriteLocalRef: async () => ({ status: "adopted" as const }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" as const }),
      stateStore,
    };

    await expect(executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      scope: { kind: "dependent-suffix", selectedDeliverableId },
      facts,
    }, {
      ...dependencies,
      absorbTop: async () => { throw new Error("crash before top absorption"); },
    })).rejects.toThrow("crash before top absorption");

    const operationId = current.value.activeOperation?.operationId;
    if (operationId === undefined) throw new Error("provider refresh must remain reserved");
    const recovered = await executeDeliveryProviderRefresh({
      plan,
      current,
      repository: "owner/repo",
      operationId,
    }, {
      ...dependencies,
      absorbTop: async ({ top }) => {
        expect(top).toEqual({ head: liveTop.head, tree: liveTop.tree });
        return { status: "absorbed", head: oid("a"), tree: oid("b") };
      },
    });

    expect(recovered).toMatchObject({
      status: "applied",
      state: {
        value: {
          activeOperation: null,
          pendingReviewFixVerification: {
            selectedDeliverableId,
            memberDeliverableIds: [selectedDeliverableId],
          },
          members: [{}, {}, {}, { coordinates: { head: oid("a"), tree: oid("b") } }],
        },
      },
    });
  });

  it("refuses an incoherent prepared predecessor chain before reserving or publishing", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const targetHead = fixture.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("fixture target must be bound");
    const state = {
      ...fixture,
      members: fixture.members.map((member, index, members) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(300 + index) },
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? targetHead : members[index - 1]!.coordinates!.head,
        },
      })),
    };
    const facts = positionFacts(state);
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const requested: DeliveryOperationSnapshotV1 = {
      target: before.target,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? before.target!.coordinates!.head : oid("f"),
          head: oid(String(index + 7)),
          tree: oid(String(index + 3)),
        },
      })),
    };
    const candidateResult = deriveDeliveryProviderRefreshCandidates({ plan, before, requested });
    if (candidateResult.status !== "derived") throw new Error("candidates must derive");
    const reserve = vi.fn();
    const rewrite = vi.fn();
    const cleanup = vi.fn(async () => ({ status: "cleaned" as const }));

    await expect(executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
      facts,
    }, {
      preparation: { prepare: async () => ({
        status: "prepared",
        observation: { snapshot: requested, targetMovement: "exact" },
        candidates: candidateResult.candidates,
      }) },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async () => [],
      rewriteMemberRef: rewrite,
      observeResult: async () => ({ status: "refused", reason: "observation-unavailable" }),
      readTargetAncestry: exactTargetAncestry,
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "refused", reason: "absorption-unavailable" }),
      publishTop: async () => ({ status: "refused", reason: "unavailable" }),
      rewriteLocalRef: async () => ({ status: "refused" }),
      cleanupPreparedCandidates: cleanup,
      stateStore: { publish: reserve },
    })).resolves.toEqual({ status: "refused", reason: "prepared-result-mismatch" });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(reserve).not.toHaveBeenCalled();
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("resumes a contiguous partial publication at only the untouched tail", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(400 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state, facts: positionFacts(state) });
    if (derived.status !== "derived") throw new Error("refresh subject must derive");
    const before = derived.subject.before;
    const targetHead = before.target?.coordinates?.head;
    if (targetHead === undefined) throw new Error("target must be bound");
    const requested: DeliveryOperationSnapshotV1 = {
      target: before.target,
      members: before.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          base: index === 0 ? targetHead : oid(String(index + 6)),
          head: oid(String(index + 7)),
          tree: oid(String(index + 3)),
        },
      })),
    };
    const operationId = "provider-refresh-operation";
    const reserved = reserveDeliveryOperation({ revision: 7, value: state }, plan, {
      operationId,
      kind: "rewrite",
      mode: "provider-refresh",
      affectedDeliverableIds: before.members.map(({ deliverableId }) => deliverableId),
      expectedStateRevision: 7,
      before,
      requested,
    });
    if (reserved.status !== "reserved") throw new Error("refresh must reserve");
    const remoteHeads = new Map(before.members.map((member, index) => [
      member.deliverableId,
      index === 0 ? requested.members[index]!.coordinates!.head : member.coordinates!.head,
    ]));
    const rewritten: string[] = [];
    const preparation = vi.fn();
    const liveTarget = {
      ref: requested.target!.ref,
      coordinates: { head: oid("b"), tree: oid("c") },
    };
    const liveObservation: DeliveryOperationSnapshotV1 = {
      ...requested,
      target: liveTarget,
      members: requested.members.map((member, index) => ({
        ...member,
        coordinates: member.coordinates === null ? null : {
          ...member.coordinates,
          base: index === 0 ? liveTarget.coordinates.head : requested.members[index - 1]!.coordinates!.head,
        },
      })),
    };

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: preparation },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (candidate) => candidate.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: remoteHeads.get(member.deliverableId) ?? null,
      })),
      rewriteMemberRef: async ({ ref, requestedHead }) => {
        const member = requested.members.find((candidate) => candidate.ref === ref)!;
        rewritten.push(member.deliverableId);
        remoteHeads.set(member.deliverableId, requestedHead);
        return { status: "rewritten" };
      },
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: liveObservation, targetMovement: "append-only" },
      }),
      readTargetAncestry: async (ancestor, descendant) => (
        ancestor === requested.target!.coordinates!.head && descendant === liveTarget.coordinates.head
          ? "ancestor"
          : "not-ancestor"
      ),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "absorbed", head: oid("a"), tree: oid("b") }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: { value: { target: requested.target, activeOperation: null } },
    });
    expect(preparation).not.toHaveBeenCalled();
    expect(rewritten).toEqual(before.members.slice(1).map(({ deliverableId }) => deliverableId));
  });

  it("settles a reserved refresh when the protected target advances append-only", async () => {
    const { plan, requested, operationId, reserved, liveTarget, observed } =
      reservedRefreshTargetMovementFixture();

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare during recovery"); } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (candidate) => candidate.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      rewriteMemberRef: async () => { throw new Error("must not republish an exact requested suffix"); },
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "append-only" },
      }),
      readTargetAncestry: async (ancestor, descendant) => (
        ancestor === requested.target!.coordinates!.head && descendant === liveTarget.coordinates.head
          ? "ancestor"
          : "not-ancestor"
      ),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "absorbed", head: oid("d"), tree: oid("e") }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "applied",
      state: { value: { target: requested.target, activeOperation: null } },
    });
  });

  it("routes a retained terminal content conflict to attended resolution", async () => {
    const { plan, requested, operationId, reserved, liveTarget, observed } =
      reservedRefreshTargetMovementFixture();

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: async () => { throw new Error("must not prepare during recovery"); } },
      preflightTop: readyTop,
      observeMemberRefCheckouts: clearMemberRefCheckouts,
      observePublishedHeads: async (candidate) => candidate.members.map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      rewriteMemberRef: async () => { throw new Error("must not republish an exact requested suffix"); },
      observeResult: async () => ({
        status: "observed",
        observation: { snapshot: observed, targetMovement: "append-only" },
      }),
      readTargetAncestry: async (ancestor, descendant) => (
        ancestor === requested.target!.coordinates!.head && descendant === liveTarget.coordinates.head
          ? "ancestor"
          : "not-ancestor"
      ),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({
        status: "refused",
        reason: "content-conflict",
        paths: ["shared.txt"],
      }),
      publishTop: async () => { throw new Error("must not publish a conflicted top"); },
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async () => { throw new Error("must not persist a conflicted settlement"); } },
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "content-conflict",
      paths: ["shared.txt"],
      conflictPreparation: {
        topRef: reserved.state.members.at(-1)!.ref,
        logicalMergeBase: reserved.state.members.at(-1)!.coordinates!.base,
        parents: {
          top: reserved.state.members.at(-1)!.coordinates!.head,
          refreshedPredecessor: observed.members.at(-1)!.coordinates!.head,
        },
        mergeTree: {
          argv: [
            "git", "merge-tree", "--write-tree", "--merge-base",
            reserved.state.members.at(-1)!.coordinates!.base,
            "--name-only", "-z", "--no-messages",
            reserved.state.members.at(-1)!.coordinates!.head,
            observed.members.at(-1)!.coordinates!.head,
          ],
        },
      },
      operationId,
      nextAction: "resolve-terminal-conflicts",
      recommendedActionText:
        "The provider-refresh reservation remains active. Resolve the listed terminal predecessor conflicts as "
        + "one exact two-parent absorption commit, then run `arc delivery reconcile` and retry its exact selector.",
    });
  });

  for (const targetRelation of ["not-ancestor", null] as const) {
    it(`blocks reserved refresh settlement when requested-to-live target ancestry is ${
      targetRelation ?? "unavailable"
    }`, async () => {
      const { plan, requested, operationId, reserved, observed } = reservedRefreshTargetMovementFixture();
      let externalEffects = 0;

      const result = await executeDeliveryProviderRefresh({
        plan,
        current: { revision: 8, value: reserved.state },
        repository: "owner/repo",
        operationId,
      }, {
        preparation: { prepare: async () => { throw new Error("must not prepare during recovery"); } },
        preflightTop: readyTop,
        observeMemberRefCheckouts: clearMemberRefCheckouts,
        observePublishedHeads: async (candidate) => candidate.members.map((member) => ({
          deliverableId: member.deliverableId,
          head: member.coordinates!.head,
        })),
        rewriteMemberRef: async () => { throw new Error("must not republish an exact requested suffix"); },
        observeResult: async () => ({
          status: "observed",
          observation: { snapshot: observed, targetMovement: "append-only" },
        }),
        readTargetAncestry: async () => targetRelation,
        proveContribution: async () => {
          externalEffects += 1;
          return { status: "accepted", proof: "mechanical-reapply" };
        },
        absorbTop: async () => {
          externalEffects += 1;
          return { status: "absorbed", head: oid("d"), tree: oid("e") };
        },
        publishTop: async () => {
          externalEffects += 1;
          return { status: "published" };
        },
        rewriteLocalRef: async () => {
          externalEffects += 1;
          return { status: "adopted" };
        },
        cleanupPreparedCandidates: async () => {
          externalEffects += 1;
          return { status: "cleaned" };
        },
        stateStore: { publish: async (_planId, value, revision) => {
          externalEffects += 1;
          return { status: "ok", value: { revision: revision + 1, value } };
        } },
      });

      expect(result).toEqual({
        status: "blocked",
        reason: targetRelation === null ? "observation-unavailable" : "target-rewritten",
        operationId,
        nextAction: "reconcile",
        recommendedActionText:
          "The provider-refresh reservation remains active. Run `arc delivery reconcile` and retry its exact selector.",
      });
      expect(externalEffects).toBe(0);
      expect(reserved.state.activeOperation?.requested.target).toEqual(requested.target);
    });
  }
});
