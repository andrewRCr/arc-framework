import { describe, expect, it, vi } from "vitest";

import {
  classifyDeliveryProviderRefreshPublication,
  deriveDeliveryProviderRefreshCandidates,
  executeDeliveryProviderRefresh,
} from "../../../src/lib/delivery/provider-refresh-execution.js";
import type { DeliveryOperationSnapshotV1 } from "../../../src/lib/delivery/schema.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { deriveDeliveryProviderRefreshSubject } from
  "../../../src/lib/delivery/provider-refresh-observation.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const oid = (digit: string): string => digit.repeat(40);

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

  it("reserves before bottom-up publication and settles candidates with the terminal top", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(200 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state });
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
    const events: string[] = [];

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 7, value: state },
      repository: "owner/repo",
      scope: { kind: "complete-remainder" },
    }, {
      preparation: { prepare: async () => {
        events.push("prepare");
        return {
          status: "prepared",
          observation: { snapshot: requested, targetMovement: "exact" },
          candidates: candidateResult.candidates,
        };
      } },
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
      cleanupPreparedCandidates: async () => {
        events.push("cleanup");
        return { status: "cleaned" };
      },
      stateStore: { publish: async (_planId, value, revision) => {
        events.push(value.activeOperation === null ? "final" : "reserve");
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });

    expect(result.status).toBe("applied");
    expect(events.indexOf("reserve")).toBeLessThan(events.indexOf(`rewrite:${before.members[0]!.deliverableId}`));
    expect(events.slice(-4)).toEqual(["absorb", "publish-top", "cleanup", "final"]);
  });

  it("refuses an incoherent prepared predecessor chain before reserving or publishing", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = {
      ...fixture,
      members: fixture.members.map((member, index) => ({
        ...member,
        changeRequest: { providerId: "github", changeRequestId: String(300 + index) },
      })),
    };
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state });
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
    }, {
      preparation: { prepare: async () => ({
        status: "prepared",
        observation: { snapshot: requested, targetMovement: "exact" },
        candidates: candidateResult.candidates,
      }) },
      observePublishedHeads: async () => [],
      rewriteMemberRef: rewrite,
      observeResult: async () => ({ status: "refused", reason: "observation-unavailable" }),
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
    const derived = deriveDeliveryProviderRefreshSubject({ plan, state });
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

    const result = await executeDeliveryProviderRefresh({
      plan,
      current: { revision: 8, value: reserved.state },
      repository: "owner/repo",
      operationId,
    }, {
      preparation: { prepare: preparation },
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
        observation: { snapshot: requested, targetMovement: "exact" },
      }),
      proveContribution: async () => ({ status: "accepted", proof: "mechanical-reapply" }),
      absorbTop: async () => ({ status: "absorbed", head: oid("a"), tree: oid("b") }),
      publishTop: async () => ({ status: "published" }),
      rewriteLocalRef: async () => ({ status: "adopted" }),
      cleanupPreparedCandidates: async () => ({ status: "cleaned" }),
      stateStore: { publish: async (_planId, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result.status).toBe("applied");
    expect(preparation).not.toHaveBeenCalled();
    expect(rewritten).toEqual(before.members.slice(1).map(({ deliverableId }) => deliverableId));
  });
});
