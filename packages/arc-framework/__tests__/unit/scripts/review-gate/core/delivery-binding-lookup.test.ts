import { describe, expect, it } from "vitest";

import { deliveryPlanFixture } from "../../../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../../../fixtures/delivery-state.js";
import { DeliveryStateV1Schema } from "../../../../../src/lib/delivery/schema.js";
import type { CanonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { DeliveryBindingLookup } from "../../../../../src/scripts/review-gate/core/delivery-binding-lookup.js";

const ok = <T>(value: T) => ({ status: "ok" as const, value });

function changeSetTarget() {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repository",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
}

function memberTarget(headSha: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: "repository",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha,
    headTree: "d".repeat(40),
  });
}

describe("DeliveryBindingLookup", () => {
  it("resolves a coherent control-branch plan binding", async () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const lookup = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([plan]),
      readState: async () => ok({ revision: 1, value: state }),
      resolveMember: async () => ok(null),
    });

    await expect(lookup.resolve({
      target: changeSetTarget(),
      workUnitId: plan.workUnitId,
    })).resolves.toEqual({ status: "bound", planId: plan.planId });
  });

  it("distinguishes authoritative absence from ambiguous or missing evidence", async () => {
    const plan = deliveryPlanFixture();
    const target = changeSetTarget();
    const absent = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([]),
      readState: async () => ok(null),
      resolveMember: async () => ok(null),
    });
    await expect(absent.resolve({ target, workUnitId: null }))
      .resolves.toEqual({ status: "authoritative-unbound" });
    await expect(absent.resolve({ target, workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "authoritative-unbound" });

    const ambiguous = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([plan, plan]),
      readState: async () => ok(null),
      resolveMember: async () => ok(null),
    });
    await expect(ambiguous.resolve({ target, workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "unavailable", reason: "ambiguous-plan" });

    const unavailable = new DeliveryBindingLookup({
      enumeratePlans: async () => { throw new Error("publisher unavailable"); },
      readState: async () => ok(null),
      resolveMember: async () => ok(null),
    });
    await expect(unavailable.resolve({ target, workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "unavailable", reason: "reader-failure" });
  });

  it("contains malformed and incoherent state as unavailable evidence", async () => {
    const plan = deliveryPlanFixture();
    const target = changeSetTarget();
    const malformed = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([plan]),
      readState: async () => ({ status: "refused", reason: "record-malformed" }),
      resolveMember: async () => ok(null),
    });
    await expect(malformed.resolve({ target, workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "unavailable", reason: "record-malformed" });

    const incoherent = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([plan]),
      readState: async () => ok({
        revision: 1,
        value: DeliveryStateV1Schema.parse({
          ...deliveryStateFixture(plan),
          workUnitId: "another-work-unit",
        }),
      }),
      resolveMember: async () => ok(null),
    });
    await expect(incoherent.resolve({ target, workUnitId: plan.workUnitId }))
      .resolves.toEqual({ status: "unavailable", reason: "subject-mismatch" });
  });

  it("requires an exact authoritative member binding", async () => {
    const plan = deliveryPlanFixture();
    const state = deliveryStateFixture(plan);
    const member = state.members[0];
    if (member?.coordinates === null || member?.coordinates === undefined) {
      throw new Error("fixture member must be bound");
    }
    const resolution = {
      planId: plan.planId,
      deliverableId: member.deliverableId as CanonicalDigest,
      workUnitId: plan.workUnitId,
      state,
    };
    const lookup = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([plan]),
      readState: async () => ok({ revision: 1, value: state }),
      resolveMember: async () => ok(resolution),
    });
    await expect(lookup.resolve({
      target: memberTarget(member.coordinates.head),
      workUnitId: plan.workUnitId,
    })).resolves.toEqual({ status: "bound", planId: plan.planId });

    const missingPlan = new DeliveryBindingLookup({
      enumeratePlans: async () => ok([]),
      readState: async () => ok(null),
      resolveMember: async () => ok(resolution),
    });
    await expect(missingPlan.resolve({
      target: memberTarget(member.coordinates.head),
      workUnitId: plan.workUnitId,
    })).resolves.toEqual({ status: "unavailable", reason: "state-without-plan" });
  });
});
