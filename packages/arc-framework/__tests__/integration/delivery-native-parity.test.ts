import { describe, expect, it, vi } from "vitest";

import {
  degradeNativeDeliveryStack,
  linkDeliveryNativeStack,
  type DeliveryNativeStackInput,
} from "../../src/lib/delivery/native-stack.js";
import { selectNativeDeliveryLandingArm } from "../../src/lib/delivery/native-landing.js";
import { adoptDeliveryTerminalMerge } from "../../src/lib/delivery/terminal.js";
import { deliveryThreeMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";

const plan = deliveryThreeMemberStackPlanFixture();
const nativeMembers: DeliveryNativeStackInput["members"] = plan.members.slice(0, -1).map((member, index) => ({
  deliverableId: member.deliverableId,
  changeRequestId: String(41 + index),
  headRef: `delivery/example/${member.chunkKey}`,
  headSha: String(index + 4).repeat(40),
  baseRef: index === 0 ? "main" : `delivery/example/${plan.members[index - 1]?.chunkKey}`,
  headRepository: "owner/repo",
}));
const input = { repository: "owner/repo", members: nativeMembers };

async function terminalProjection(landingBatches: readonly (readonly string[])[]) {
  const initial = deliveryStateFixture(plan);
  const expectedIds = plan.members.slice(0, -1).map((member) => member.deliverableId);
  const landedDeliverableIds = landingBatches.flat();
  if (JSON.stringify(landedDeliverableIds) !== JSON.stringify(expectedIds)) {
    throw new Error("landing batches must cover the exact ordered non-terminal remainder");
  }
  let members = initial.members.map((member, index) => index === initial.members.length - 1 ? {
    deliverableId: member.deliverableId, ref: null, changeRequest: null, coordinates: null,
  } : member);
  for (const batch of landingBatches) {
    const landed = new Set(batch);
    members = members.map((member) => landed.has(member.deliverableId) ? {
      deliverableId: member.deliverableId, ref: null, changeRequest: null, coordinates: null,
    } : member);
  }
  const state = {
    ...initial,
    members,
  };
  const targetBefore = state.target!.coordinates!;
  const targetAfter = { head: "e".repeat(40), tree: "f".repeat(40) };
  const result = await adoptDeliveryTerminalMerge({
    resolution: { status: "delivery", plan, current: { revision: 8, value: state } },
    repository: "owner/repo",
    retainedControlRef: "refs/heads/feat/control",
    retainedControlHead: "c".repeat(40),
    landedDeliverableIds,
    request: {
      binding: { providerId: "github", changeRequestId: "99" },
      repository: "owner/repo", headRepository: "owner/repo", headRef: "feat/control",
      headSha: "c".repeat(40), baseRef: state.target!.ref.replace("refs/heads/", ""),
      state: "merged", draft: false,
    },
    targetBefore,
    targetAfter,
    proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
    stateStore: { publish: async (_planId, value, revision) => ({
      status: "ok", value: { revision: revision + 1, value },
    }) },
  });
  if (result.status !== "attached") throw new Error("terminal fixture must attach");
  return result.state.value;
}

describe("native delivery degradation parity", () => {
  it("keeps opt-out host-silent and sends queue refusal through unlink before the ordinary arm", async () => {
    const optOutObserve = vi.fn();
    const optOutLink = vi.fn();
    await expect(linkDeliveryNativeStack({ ...input, optIn: false }, {
      observe: optOutObserve, link: optOutLink,
    })).resolves.toMatchObject({ status: "unlinked" });
    expect(optOutObserve).not.toHaveBeenCalled();
    expect(optOutLink).not.toHaveBeenCalled();

    const selected = selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 7 },
      mergeStrategy: "merge", mergeAction: "queue", explicitAtomic: true,
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });
    expect(selected).toMatchObject({ status: "downgrade-required", reason: "queue-not-atomic" });
    const calls: string[] = [];
    const observe = vi.fn()
      .mockImplementationOnce(async () => { calls.push("observe-linked"); return { status: "registered", stackNumber: 7 }; })
      .mockImplementationOnce(async () => { calls.push("observe-unlinked"); return { status: "unregistered" }; });
    const unlink = vi.fn(async () => { calls.push("unlink"); return { status: "submitted" as const }; });
    await expect(degradeNativeDeliveryStack(input, { observe, unlink }))
      .resolves.toMatchObject({ status: "unlinked" });
    expect(calls).toEqual(["observe-linked", "unlink", "observe-unlinked"]);
  });

  it("authorizes only the exact nonterminal set and converges sequential, degraded, and atomic terminal state", async () => {
    const singleton = selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 7 },
      mergeStrategy: "merge", mergeAction: "direct", explicitAtomic: false,
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({ deliverableId, changeRequestId, headSha })),
    });
    const atomic = selectNativeDeliveryLandingArm({
      plan, landedPrefix: [], observation: { status: "registered", stackNumber: 7 },
      mergeStrategy: "merge", mergeAction: "direct", explicitAtomic: true,
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({ deliverableId, changeRequestId, headSha })),
    });
    expect(singleton).toMatchObject({ status: "selected", arm: "linked-single", members: [expect.any(Object)] });
    expect(atomic).toMatchObject({ status: "selected", arm: "linked-atomic", members: expect.any(Array) });
    if (atomic.status !== "selected") throw new Error("atomic fixture must select");
    expect(atomic.members.map((member) => member.deliverableId)).toEqual(
      plan.members.slice(0, -1).map((member) => member.deliverableId),
    );
    expect(atomic.members).toHaveLength(plan.members.length - 1);

    const ids = plan.members.slice(0, -1).map((member) => member.deliverableId);
    const sequentialBatches = ids.map((deliverableId) => [deliverableId]);

    const degradeObserve = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unregistered" });
    await expect(degradeNativeDeliveryStack(input, {
      observe: degradeObserve,
      unlink: vi.fn().mockResolvedValue({ status: "submitted" }),
    })).resolves.toMatchObject({ status: "unlinked" });
    const degradedBatches = ids.map((deliverableId) => [deliverableId]);
    const groupedBatches = [atomic.members.map((member) => member.deliverableId)];

    const [sequential, degraded, grouped] = await Promise.all([
      terminalProjection(sequentialBatches),
      terminalProjection(degradedBatches),
      terminalProjection(groupedBatches),
    ]);
    expect(degraded).toEqual(sequential);
    expect(grouped).toEqual(sequential);
  });

  it("blocks unlink refusal or unavailable reobservation without exposing a landing arm", async () => {
    const observe = vi.fn()
      .mockResolvedValueOnce({ status: "registered", stackNumber: 7 })
      .mockResolvedValueOnce({ status: "unavailable" });
    const unlink = vi.fn().mockResolvedValue({ status: "refused", reason: "unavailable" });
    await expect(degradeNativeDeliveryStack(input, { observe, unlink }))
      .resolves.toMatchObject({ status: "blocked", reason: "unlink-unavailable" });
  });
});
