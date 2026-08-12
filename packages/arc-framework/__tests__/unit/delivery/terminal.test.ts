import { describe, expect, it, vi } from "vitest";

import {
  adoptDeliveryTerminalMerge,
  assessDeliveryAbsorption,
  assessDeliveryTerminalReadiness,
  executeDeliveryAbsorption,
} from "../../../src/lib/delivery/terminal.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
  const initial = deliveryStateFixture(plan);
  const terminal = initial.members[2]!;
  const state = {
    ...initial,
    members: initial.members.map((member, index) => index < 2
      ? { deliverableId: member.deliverableId, ref: null, changeRequest: null, coordinates: null }
      : { deliverableId: terminal.deliverableId, ref: null, changeRequest: null, coordinates: null }),
  };
  const targetBefore = initial.target!.coordinates!;
  const controlBefore = { ref: "refs/heads/feat/control", head: "a".repeat(40), tree: "b".repeat(40) };
  const controlAfter = { ref: controlBefore.ref, head: "c".repeat(40), tree: "d".repeat(40) };
  const targetAfter = { head: "e".repeat(40), tree: "f".repeat(40) };
  return { plan, state, targetBefore, targetAfter, controlBefore, controlAfter, terminal };
}

describe("delivery terminal handoff", () => {
  it("derives ready, already-absorbed, and independently blocked absorption states", () => {
    const f = fixture();
    const base = {
      plan: f.plan, state: f.state, landedDeliverableIds: f.plan.members.slice(0, -1).map((m) => m.deliverableId),
      retainedControl: f.controlBefore, observedControl: f.controlBefore,
      protectedTarget: { ref: f.state.target!.ref, ...f.targetBefore }, dirty: false, suffixReconciled: true,
    } as const;
    expect(assessDeliveryAbsorption({ ...base, absorption: "required" })).toMatchObject({ status: "absorption-ready" });
    expect(assessDeliveryAbsorption({ ...base, absorption: "exact" })).toEqual({ status: "already-absorbed" });
    expect(assessDeliveryAbsorption({ ...base, dirty: true, absorption: "required" })).toEqual({
      status: "blocked", reason: "dirty-control",
    });
    expect(assessDeliveryAbsorption({ ...base, suffixReconciled: false, absorption: "required" })).toEqual({
      status: "blocked", reason: "suffix-unreconciled",
    });
    expect(assessDeliveryAbsorption({ ...base, absorption: "stale" })).toEqual({
      status: "blocked", reason: "absorption-stale",
    });
    expect(assessDeliveryAbsorption({
      ...base,
      landedDeliverableIds: base.landedDeliverableIds.slice(0, -1),
      absorption: "required",
    })).toEqual({ status: "blocked", reason: "landed-prefix-incomplete" });
    expect(assessDeliveryAbsorption({
      ...base,
      state: { ...f.state, activeOperation: {
        operationId: "terminal-test",
        kind: "materialize",
        affectedDeliverableIds: [f.state.members[0]!.deliverableId],
        stateRevision: 1,
        boundPlanDigest: f.plan.planDigest,
        before: { target: f.state.target, members: [f.state.members[0]!] },
        requested: { target: f.state.target, members: [f.state.members[0]!] },
      } },
      absorption: "required",
    })).toEqual({ status: "blocked", reason: "operation-active" });
  });

  it("performs one append-only merge and Tier 1 only for an exact ready intent", async () => {
    const f = fixture();
    const merge = vi.fn(async () => ({ status: "merged" as const }));
    const tier1 = vi.fn(async () => ({ status: "passed" as const }));
    await expect(executeDeliveryAbsorption({
      decision: { status: "absorption-ready", intent: {
        controlRef: f.controlBefore.ref, controlHead: f.controlBefore.head,
        protectedTargetRef: f.state.target!.ref, protectedTargetHead: f.targetBefore.head,
      } }, merge, tier1,
    })).resolves.toEqual({ status: "absorbed" });
    expect(merge).toHaveBeenCalledOnce();
    expect(tier1).toHaveBeenCalledOnce();
    await expect(executeDeliveryAbsorption({ decision: { status: "already-absorbed" }, merge, tier1 }))
      .resolves.toEqual({ status: "already-absorbed" });
    expect(merge).toHaveBeenCalledOnce();
  });

  it("exposes the terminal only after exact absorption and residual contribution proof", async () => {
    await expect(assessDeliveryTerminalReadiness({
      absorption: { status: "already-absorbed" }, terminalUnbound: true,
      proveResidual: async () => ({ status: "accepted", proof: "aggregate-patch" }),
    })).resolves.toEqual({ status: "terminal-ready" });
    await expect(assessDeliveryTerminalReadiness({
      absorption: { status: "already-absorbed" }, terminalUnbound: true,
      proveResidual: async () => ({ status: "refused", reason: "contribution-mismatch" }),
    })).resolves.toEqual({ status: "blocked", reason: "residual-mismatch" });
  });

  it("adopts one exact ordinary merge without a reservation and is idempotent", async () => {
    const f = fixture();
    const request = {
      binding: { providerId: "github", changeRequestId: "999" }, repository: "owner/repo",
      headRepository: "owner/repo", headRef: "feat/control", headSha: f.controlAfter.head,
      baseRef: f.state.target!.ref.replace("refs/heads/", ""), state: "merged" as const, draft: false,
    };
    const publish = vi.fn(async (_id, value, revision) => ({
      status: "ok" as const, value: { revision: revision + 1, value },
    }));
    const input = {
      resolution: { status: "delivery" as const, plan: f.plan, current: { revision: 8, value: f.state } },
      repository: "owner/repo", retainedControlRef: "refs/heads/feat/control", retainedControlHead: f.controlAfter.head,
      landedDeliverableIds: f.plan.members.slice(0, -1).map((m) => m.deliverableId),
      request, targetBefore: f.targetBefore, targetAfter: f.targetAfter,
      proveResidual: async () => ({ status: "accepted" as const, proof: "aggregate-patch" as const }),
      stateStore: { publish },
    };
    const adopted = await adoptDeliveryTerminalMerge(input);
    expect(adopted).toMatchObject({ status: "attached", state: { value: { activeOperation: null } } });
    if (adopted.status !== "attached") return;
    expect(adopted.state.value.members[2]).toMatchObject({
      ref: "refs/heads/feat/control", changeRequest: request.binding,
      coordinates: { base: f.targetBefore.head, head: f.targetAfter.head, tree: f.targetAfter.tree },
    });
    expect(adopted.state.value.activeOperation).toBeNull();
    const repeat = await adoptDeliveryTerminalMerge({
      ...input, resolution: { status: "delivery", plan: f.plan, current: adopted.state },
    });
    expect(repeat).toEqual({ status: "already-attached", state: adopted.state });
    expect(publish).toHaveBeenCalledOnce();
  });

  it("returns not-applicable only for a proven ordinary WU and blocks bad terminal evidence", async () => {
    const f = fixture();
    const common = {
      repository: "owner/repo", retainedControlRef: "refs/heads/feat/control", retainedControlHead: f.controlAfter.head,
      landedDeliverableIds: f.plan.members.slice(0, -1).map((m) => m.deliverableId),
      request: { binding: { providerId: "github", changeRequestId: "999" }, repository: "owner/repo",
        headRepository: "owner/repo", headRef: "wrong", headSha: f.controlAfter.head,
        baseRef: "main", state: "merged" as const, draft: false },
      targetBefore: f.targetBefore, targetAfter: f.targetAfter,
      proveResidual: async () => ({ status: "accepted" as const, proof: "tree-equality" as const }),
      stateStore: { publish: vi.fn() },
    };
    await expect(adoptDeliveryTerminalMerge({ ...common, resolution: { status: "ordinary" } }))
      .resolves.toEqual({ status: "not-applicable" });
    await expect(adoptDeliveryTerminalMerge({ ...common, resolution: { status: "unavailable" } }))
      .resolves.toEqual({ status: "blocked", reason: "plan-unavailable" });
    await expect(adoptDeliveryTerminalMerge({
      ...common, resolution: { status: "delivery", plan: f.plan, current: { revision: 8, value: f.state } },
    })).resolves.toEqual({ status: "blocked", reason: "request-mismatch" });
    await expect(adoptDeliveryTerminalMerge({
      ...common,
      request: { ...common.request, headRef: "feat/control", baseRef: "foreign" },
      resolution: { status: "delivery", plan: f.plan, current: { revision: 8, value: f.state } },
    })).resolves.toEqual({ status: "blocked", reason: "request-mismatch" });
  });
});
