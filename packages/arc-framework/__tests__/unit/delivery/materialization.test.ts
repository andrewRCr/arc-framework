import { describe, expect, it } from "vitest";

import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  publishDeliveryRequests,
} from "../../../src/lib/delivery/materialization.js";
import type { DeliveryStateV1 } from "../../../src/lib/delivery/schema.js";
import { deliveryPlanFixture } from "../../fixtures/delivery-plan.js";

const protectedHead = "1".repeat(40);
const protectedTree = "2".repeat(40);
const firstHead = "3".repeat(40);
const firstTree = "4".repeat(40);
const controlHead = "5".repeat(40);
const controlTree = "6".repeat(40);

function eligible(plan = deliveryPlanFixture()) {
  return {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: "refs/heads/main", head: protectedHead, tree: protectedTree },
    control: { ref: "refs/heads/feat/example", head: controlHead, tree: controlTree },
    members: plan.members.map((member, index) => ({
      deliverableId: member.deliverableId,
      ref: `refs/heads/candidate-${index + 1}`,
      head: index === 0 ? firstHead : controlHead,
      tree: index === 0 ? firstTree : controlTree,
    })),
    lifecyclePaths: [],
  };
}

function memoryStateStore() {
  let record: { revision: number; value: DeliveryStateV1 } | null = null;
  return {
    read: async () => ({ status: "ok" as const, value: record }),
    publish: async (_planId: string, value: DeliveryStateV1, expectedRevision: number) => {
      if (record?.revision !== expectedRevision && !(record === null && expectedRevision === 0)) {
        return { status: "refused" as const, reason: "version-conflict" as const };
      }
      record = { revision: expectedRevision + 1, value };
      return { status: "ok" as const, value: record };
    },
  };
}

describe("deriveDeliveryMaterialization", () => {
  it("derives ordered presentation refs and omits a terminal delivery ref", () => {
    const plan = deliveryPlanFixture();
    const result = deriveDeliveryMaterialization(plan, eligible(plan));
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    expect(result.value.members).toEqual([
      expect.objectContaining({
        deliverableId: plan.members[0]!.deliverableId,
        ref: `refs/heads/delivery/${plan.workUnitId}/${plan.members[0]!.chunkKey}`,
        requestBaseRef: "refs/heads/main",
        coordinates: { base: protectedHead, head: firstHead, tree: firstTree },
      }),
      expect.objectContaining({
        deliverableId: plan.members[1]!.deliverableId,
        ref: null,
        requestBaseRef: null,
        coordinates: { base: firstHead, head: controlHead, tree: controlTree },
      }),
    ]);
    expect(deriveDeliveryMaterialization(plan, { ...eligible(plan), planDigest: "sha256:" + "0".repeat(64) }))
      .toEqual({ status: "refused", reason: "snapshot-mismatch" });
  });
});

describe("delivery materialization orchestration", () => {
  it("binds the first exact ref once, then reserves target and remaining coordinate changes", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = { publish: async () => ({ status: "published" as const }) };
    const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    expect(bound.status).toBe("bound");
    if (bound.status !== "bound") return;
    expect(bound.state.value.members[0]).toMatchObject({
      ref: derived.value.members[0]!.ref,
      coordinates: derived.value.members[0]!.coordinates,
    });
    await expect(bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs }))
      .resolves.toEqual({ status: "refused", reason: "state-exists" });

    const materialized = await materializeBoundDeliveryChain({
      plan,
      materialization: derived.value,
      stateStore: store,
      refs,
    });
    expect(materialized.status).toBe("materialized");
    if (materialized.status === "materialized") {
      expect(materialized.state.value.target).toEqual({
        ref: "refs/heads/main",
        coordinates: { head: protectedHead, tree: protectedTree },
      });
      expect(materialized.state.value.activeOperation).toBeNull();
    }
  });

  it("adopts one exact request result while ambiguity leaves the reservation", async () => {
    const plan = deliveryPlanFixture();
    const derived = deriveDeliveryMaterialization(plan, eligible(plan));
    if (derived.status !== "derived") throw new Error("fixture must derive");
    const store = memoryStateStore();
    const refs = { publish: async () => ({ status: "adopted" as const }) };
    await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore: store, refs });
    await materializeBoundDeliveryChain({ plan, materialization: derived.value, stateStore: store, refs });
    const host = {
      observeRequest: async () => ({
        status: "observed" as const,
        request: {
          binding: { providerId: "github", changeRequestId: "401" },
          repository: "andrewRCr/arc-framework",
          headRepository: "andrewRCr/arc-framework",
          headRef: derived.value.members[0]!.ref!.replace("refs/heads/", ""),
          headSha: firstHead,
          baseRef: "main",
          state: "open" as const,
          draft: true,
        },
      }),
      openRequest: async () => ({ status: "submitted" as const }),
      readRequest: async () => ({ status: "absent" as const }),
      mergeRequest: async () => ({ status: "submitted" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    };
    const published = await publishDeliveryRequests({
      plan,
      materialization: derived.value,
      stateStore: store,
      host,
      repository: "andrewRCr/arc-framework",
      draft: true,
      presentation: () => ({ title: "First", body: "Exact member" }),
    });
    expect(published.status).toBe("published");
    if (published.status === "published") {
      expect(published.state.value.members[0]!.changeRequest).toEqual({
        providerId: "github",
        changeRequestId: "401",
      });
    }
  });
});
