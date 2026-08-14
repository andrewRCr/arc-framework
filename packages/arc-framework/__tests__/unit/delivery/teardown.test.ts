import { describe, expect, it, vi } from "vitest";

import { teardownLandedDeliveryMember } from "../../../src/lib/delivery/teardown.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
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
  it("reserves, deletes exact residue, and atomically clears all member bindings", async () => {
    const { plan, state, facts, first, request } = fixture();
    const writes: typeof state[] = [];
    const deleteRef = vi.fn(async () => ({ status: "deleted" as const }));
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request }) }, deleteRef,
      stateStore: { publish: async (_id, value, revision) => {
        writes.push(value as typeof state);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({ status: "torn-down", state: { value: { activeOperation: null } } });
    if (result.status !== "torn-down") return;
    expect(result.state.value.members[0]).toEqual({
      deliverableId: first.deliverableId, ref: null, changeRequest: null, coordinates: null,
    });
    expect(deleteRef).toHaveBeenCalledWith({ ref: first.ref, expectedHead: request.headSha });
    expect(writes).toHaveLength(2);
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
      host: { readRequest: async () => ({ status: "observed", request: { ...request, state: "open" as const } }) },
      deleteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    const deleteRef = vi.fn(async () => ({ status: "adopted" as const }));
    await expect(teardownLandedDeliveryMember({
      ...common,
      host: { readRequest: async () => ({
        status: "observed", request: { ...request, headSha: "a".repeat(40) },
      }) },
      deleteRef,
    })).resolves.toEqual({ status: "refused", reason: "request-mismatch" });
    await expect(teardownLandedDeliveryMember({
      ...common, deliverableId: state.members[1]!.deliverableId,
      host: { readRequest: async () => ({ status: "observed", request }) },
      deleteRef: async () => ({ status: "adopted" }),
    })).resolves.toEqual({ status: "refused", reason: "member-not-landed" });
    expect(publish).not.toHaveBeenCalled();
    expect(deleteRef).not.toHaveBeenCalled();
  });

  it("retains the persisted reservation when deletion or post-delete request proof is unavailable", async () => {
    const { plan, state, facts, first, request } = fixture();
    let reads = 0;
    const published: typeof state[] = [];
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => (++reads === 1
        ? { status: "observed", request }
        : { status: "refused", reason: "unavailable" }) },
      deleteRef: async () => ({ status: "adopted" }),
      stateStore: { publish: async (_id, value, revision) => {
        published.push(value as typeof state);
        return { status: "ok", value: { revision: revision + 1, value } };
      } },
    });
    expect(result).toMatchObject({ status: "blocked", reason: "request-mismatch" });
    if (result.status !== "blocked") return;
    expect(result.reservation.value.activeOperation?.kind).toBe("teardown");
    expect(published).toHaveLength(1);
  });

  it("retains the reservation when the exact-head deletion lease refuses", async () => {
    const { plan, state, facts, first, request } = fixture();
    const result = await teardownLandedDeliveryMember({
      plan, current: { revision: 4, value: state }, facts, deliverableId: first.deliverableId,
      repository: "owner/repo", protectedTargetRef: "refs/heads/main",
      host: { readRequest: async () => ({ status: "observed", request }) },
      deleteRef: async () => ({ status: "refused" }),
      stateStore: { publish: async (_id, value, revision) => ({
        status: "ok", value: { revision: revision + 1, value },
      }) },
    });
    expect(result).toMatchObject({ status: "blocked", reason: "delete-refused" });
    if (result.status === "blocked") expect(result.reservation.value.activeOperation?.kind).toBe("teardown");
  });
});
