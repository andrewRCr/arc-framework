import { describe, expect, it, vi } from "vitest";

import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { teardownLandedDeliveryMember } from "../../../src/lib/delivery/teardown.js";
import {
  deliveryPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const original = deliveryStateFixture(plan);
  const first = {
    ...original.members[0]!,
    changeRequest: { providerId: "github", changeRequestId: "101" },
  };
  const state = { ...original, members: [first, ...original.members.slice(1)] };
  const facts = { target: state.target, members: state.members, landedDeliverableIds: [first.deliverableId] };
  const request = {
    binding: first.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
    headRef: first.ref!.replace("refs/heads/", ""), headSha: first.coordinates!.head, baseRef: "main",
    state: "merged" as const, draft: false,
  };
  return { plan, state, facts, first, request };
}

describe("landed delivery teardown", () => {
  it("reserves and deletes exact residue while retaining the member bindings", async () => {
    const { plan, state, facts, first, request } = fixture();
    const writes: DeliveryStateV1[] = [];
    let localPresent = true;
    let remotePresent = true;
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => {
        localPresent = false;
        return { status: "deleted" };
      },
      deleteRemoteRef: async () => {
        remotePresent = false;
        return { status: "deleted" };
      },
      stateStore: { publish: async (_id, value, revision) => {
        writes.push(DeliveryStateV1Schema.parse(value));
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({ status: "torn-down", state: { value: { activeOperation: null } } });
    if (result.status !== "torn-down") return;
    expect(result.state.value.members[0]).toEqual(first);
    expect({ localPresent, remotePresent }).toEqual({ localPresent: false, remotePresent: false });
    expect(writes).toHaveLength(2);
  });

  it("consumes an exact preserved teardown reservation without reserving a second operation", async () => {
    const { plan, state, facts, first, request } = fixture();
    const snapshot = { target: state.target, members: [first] };
    const reserved = reserveDeliveryOperation({ revision: 4, value: state }, plan, {
      operationId: "operation-teardown",
      kind: "teardown",
      mode: "member",
      candidateHeads: [],
      affectedDeliverableIds: [first.deliverableId],
      expectedStateRevision: 4,
      before: snapshot,
      requested: snapshot,
    });
    if (reserved.status !== "reserved") throw new Error("fixture must reserve teardown");
    const writes: DeliveryStateV1[] = [];
    let localPresent = true;
    let remotePresent = true;
    const result = await teardownLandedDeliveryMember({
      plan,
      current: { revision: 5, value: reserved.state },
      facts,
      deliverableId: first.deliverableId,
      repository: "owner/repo",
      protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => {
        localPresent = false;
        return { status: "deleted" };
      },
      deleteRemoteRef: async () => {
        remotePresent = false;
        return { status: "deleted" };
      },
      stateStore: { publish: async (_id, value, revision) => {
        writes.push(DeliveryStateV1Schema.parse(value));
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({
      status: "torn-down",
      state: { value: { activeOperation: null } },
      nextAction: "continue",
    });
    expect({ localPresent, remotePresent }).toEqual({ localPresent: false, remotePresent: false });
    expect(writes).toHaveLength(1);
  });

  it("retargets the open terminal request before deleting the highest member ref", async () => {
    const plan = deliveryPlanFixture();
    if (plan.members.length !== 2) throw new Error("fixture must contain two members");
    const original = deliveryStateFixture(plan);
    const members = original.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(101 + index) },
    }));
    const state = { ...original, members };
    const highest = members[0]!;
    const terminal = members[1]!;
    const facts = {
      target: state.target,
      members,
      landedDeliverableIds: [highest.deliverableId],
    };
    const memberRequest = {
      binding: highest.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
      headRef: highest.ref!.replace("refs/heads/", ""), headSha: highest.coordinates!.head,
      baseRef: "main", state: "merged" as const, draft: false,
    };
    let topRequest = {
      binding: terminal.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
      headRef: terminal.ref!.replace("refs/heads/", ""), headSha: terminal.coordinates!.head,
      baseRef: highest.ref!.replace("refs/heads/", ""), state: "open" as const, draft: true,
    };
    const events: string[] = [];
    const result = await teardownLandedDeliveryMember({
      plan,
      current: { revision: 4, value: state },
      facts,
      deliverableId: highest.deliverableId,
      repository: "owner/repo",
      protectedTargetRef: "refs/heads/main",
      host: {
        readRequest: async (_repository, binding) => binding.changeRequestId === "101"
          ? { status: "observed", request: memberRequest }
          : { status: "observed", request: topRequest },
        applyTopRemedy: async (effect) => {
          events.push("retarget");
          expect(effect).toMatchObject({
            action: "retarget",
            triggerRef: highest.ref,
            triggerHeadSha: highest.coordinates!.head,
            fromBaseRef: highest.ref!.replace("refs/heads/", ""),
            protectedBaseRef: "main",
          });
          topRequest = { ...topRequest, baseRef: "main" };
          return { status: "submitted" };
        },
      },
      deleteLocalRef: async () => {
        events.push("delete-local");
        return { status: "deleted" };
      },
      deleteRemoteRef: async () => {
        events.push("delete-remote");
        return { status: "deleted" };
      },
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });
    expect(result).toMatchObject({
      status: "torn-down",
      nextAction: "terminal-checkpoint",
      top: { status: "ready", request: { baseRef: "main" } },
    });
    expect(events).toEqual(["retarget", "delete-local", "delete-remote"]);
  });

  it("stops before deleting when the terminal request is already closed", async () => {
    const plan = deliveryPlanFixture();
    const initial = deliveryStateFixture(plan);
    const members = initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(101 + index) },
    }));
    const state = { ...initial, members };
    const highest = members[0]!;
    const terminal = members[1]!;
    const facts = {
      target: state.target,
      members,
      landedDeliverableIds: [highest.deliverableId],
    };
    const deleted = vi.fn();
    const publish = vi.fn();
    const result = await teardownLandedDeliveryMember({
      plan,
      current: { revision: 4, value: state },
      facts,
      deliverableId: highest.deliverableId,
      repository: "owner/repo",
      protectedTargetRef: "refs/heads/main",
      host: {
        readRequest: async (_repository, binding) => ({
          status: "observed",
          request: binding.changeRequestId === highest.changeRequest!.changeRequestId
            ? {
                binding: highest.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
                headRef: highest.ref!.replace("refs/heads/", ""), headSha: highest.coordinates!.head,
                baseRef: "main", state: "merged", draft: false,
              }
            : {
                binding: terminal.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
                headRef: terminal.ref!.replace("refs/heads/", ""), headSha: terminal.coordinates!.head,
                baseRef: highest.ref!.replace("refs/heads/", ""), state: "closed", draft: true,
              },
        }),
        applyTopRemedy: vi.fn(),
      },
      deleteLocalRef: deleted,
      deleteRemoteRef: deleted,
      stateStore: { publish },
    });
    expect(result).toMatchObject({
      status: "blocked",
      reason: "top-remedy-required",
      nextAction: "reopen-and-retarget",
      top: { status: "refused", reason: "top-target-mismatch" },
    });
    expect(deleted).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("accepts the exact authored predecessor base for a landed stacked member", async () => {
    const { plan, state: initial } = fixture();
    const members = initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(101 + index) },
    }));
    const state = { ...initial, members };
    const predecessor = members[0]!;
    const highest = members[1]!;
    const terminal = members[2]!;
    const facts = {
      target: state.target,
      members,
      landedDeliverableIds: [predecessor.deliverableId, highest.deliverableId],
    };
    const memberRequest = {
      binding: highest.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
      headRef: highest.ref!.replace("refs/heads/", ""), headSha: highest.coordinates!.head,
      baseRef: predecessor.ref!.replace("refs/heads/", ""), state: "merged" as const, draft: false,
    };
    const result = await teardownLandedDeliveryMember({
      plan,
      current: { revision: 4, value: state },
      facts,
      deliverableId: highest.deliverableId,
      repository: "owner/repo",
      protectedTargetRef: "refs/heads/main",
      host: { readRequest: async (_repository, binding) => binding.changeRequestId === "102"
        ? { status: "observed", request: memberRequest }
        : {
            status: "observed",
            request: {
              binding: terminal.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
              headRef: terminal.ref!.replace("refs/heads/", ""), headSha: terminal.coordinates!.head,
              baseRef: "main", state: "open" as const, draft: true,
            },
          }, applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "deleted" }),
      deleteRemoteRef: async () => ({ status: "deleted" }),
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({ status: "torn-down", nextAction: "terminal-checkpoint" });
  });

  it("adopts exact ref absence but blocks wrong-head/open/unlanded evidence before reservation", async () => {
    const { plan, state, facts, first, request } = fixture();
    const publish = vi.fn();
    const common = {
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main", stateStore: { publish },
    };
    await expect(teardownLandedDeliveryMember({
      ...common,
      host: { readRequest: async () => ({
        status: "observed",
        request: { ...request, headSha: `${request.headSha.slice(0, -1)}0` },
      }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    await expect(teardownLandedDeliveryMember({
      ...common,
      host: {
        readRequest: async () => ({ status: "observed", request: { ...request, state: "open" as const } }),
        applyTopRemedy: vi.fn(),
      },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    await expect(teardownLandedDeliveryMember({
      ...common,
      host: { readRequest: async () => ({
        status: "observed",
        request: { ...request, baseRef: "feat/unrelated" },
      }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    await expect(teardownLandedDeliveryMember({
      ...common, deliverableId: state.members[1]!.deliverableId,
      host: { readRequest: async () => ({ status: "observed", request }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "member-not-landed" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("retains the persisted reservation when deletion or post-delete request proof is unavailable", async () => {
    const { plan, state, facts, first, request } = fixture();
    let reads = 0;
    const published: DeliveryStateV1[] = [];
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => (++reads === 1
        ? { status: "observed", request }
        : { status: "refused", reason: "unavailable" }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "adopted" }),
      stateStore: { publish: async (_id, value, revision) => {
        published.push(DeliveryStateV1Schema.parse(value));
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({ status: "blocked", reason: "request-mismatch" });
    if (result.status !== "blocked" || result.reason === "top-remedy-required") return;
    expect(result.reservation.value.activeOperation?.kind).toBe("teardown");
    expect(published).toHaveLength(1);
  });

  it("retains the reservation when the exact-head deletion lease refuses", async () => {
    const { plan, state, facts, first, request } = fixture();
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request }), applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "adopted" }),
      deleteRemoteRef: async () => ({ status: "refused" }),
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });
    expect(result).toMatchObject({ status: "blocked", reason: "delete-refused" });
    if (result.status === "blocked" && result.reason !== "top-remedy-required") {
      expect(result.reservation.value.activeOperation?.kind).toBe("teardown");
    }
  });

  it("reobserves the top after highest-member deletion and reports automatic retarget", async () => {
    const { plan, state: initial } = fixture();
    const members = initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(101 + index) },
    }));
    const state = { ...initial, members };
    const highest = members[1]!;
    const top = members[2]!;
    const memberRequest = {
      binding: highest.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
      headRef: highest.ref!.replace("refs/heads/", ""), headSha: highest.coordinates!.head,
      baseRef: "main", state: "merged" as const, draft: false,
    };
    const topRequest = {
      binding: top.changeRequest!, repository: "owner/repo", headRepository: "owner/repo",
      headRef: top.ref!.replace("refs/heads/", ""), headSha: top.coordinates!.head,
      baseRef: "main", state: "open" as const, draft: true,
    };
    const facts = {
      target: state.target,
      members: state.members,
      landedDeliverableIds: members.slice(0, 2).map((member) => member.deliverableId),
    };
    let memberReads = 0;
    const result = await teardownLandedDeliveryMember({
      plan,
      current: { revision: 4, value: state },
      facts,
      deliverableId: highest.deliverableId,
      repository: "owner/repo",
      protectedTargetRef: "refs/heads/main",
      host: { readRequest: async (_repository, binding) => {
        if (binding.changeRequestId === highest.changeRequest!.changeRequestId) {
          memberReads += 1;
          return { status: "observed", request: memberRequest };
        }
        return { status: "observed", request: topRequest };
      }, applyTopRemedy: vi.fn() },
      deleteLocalRef: async () => ({ status: "deleted" }),
      deleteRemoteRef: async () => ({ status: "deleted" }),
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });

    expect(result).toMatchObject({
      status: "torn-down",
      nextAction: "terminal-checkpoint",
      top: { status: "ready", request: { baseRef: "main" } },
    });
    if (result.status === "torn-down") {
      expect(result.state.value.members[1]).toEqual(highest);
    }
    expect(memberReads).toBe(2);
  });
});
