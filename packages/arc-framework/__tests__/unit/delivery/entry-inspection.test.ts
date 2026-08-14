import { describe, expect, it, vi } from "vitest";

import {
  inspectDeliveryEntry,
  inspectDeliveryPlanLocus,
} from "../../../src/lib/delivery/entry-inspection.js";
import { renderDeliveryPlanSection } from "../../../src/lib/delivery/task-list-render.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const prefix = "# Task List\n\n";
const suffix = "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";

function dependencies(input: {
  taskList?: string;
  resolvedPlan?: typeof plan | null | "indeterminate";
  authoring?: "match" | "no-match" | "indeterminate";
  state?: ReturnType<typeof deliveryStateFixture> | null | "refused";
} = {}) {
  return {
    readTaskList: vi.fn().mockResolvedValue(input.taskList ?? `${prefix}${suffix}`),
    resolvePlan: vi.fn().mockResolvedValue(input.resolvedPlan === "indeterminate"
      ? { status: "indeterminate" }
      : input.resolvedPlan === null || input.resolvedPlan === undefined
        ? { status: "no-match" }
        : { status: "match", plan: input.resolvedPlan }),
    resolveAuthoring: vi.fn().mockResolvedValue(input.authoring === "indeterminate"
      ? { status: "indeterminate" }
      : input.authoring === "match"
        ? { status: "match", mapId: "map-1" }
        : { status: "no-match" }),
    readState: vi.fn().mockResolvedValue(input.state === "refused"
      ? { status: "refused" }
      : { status: "ok", value: input.state ?? null, revision: input.state ? 3 : null }),
  };
}

describe("delivery entry inspection", () => {
  it("classifies absent, provisional, canonical, and malformed loci without parsing plan prose", () => {
    expect(inspectDeliveryPlanLocus(`${prefix}${suffix}`, null)).toEqual({ status: "absent" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}## Delivery Plan\n\nReviewed plan prose.\n\n${suffix}`,
      null,
    )).toEqual({ status: "provisional" });
    expect(inspectDeliveryPlanLocus(`${prefix}${renderDeliveryPlanSection(plan)}${suffix}`, plan))
      .toEqual({ status: "canonical" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}## Delivery Plan\n\nFirst.\n\n## Delivery Plan\n\nSecond.\n\n${suffix}`,
      null,
    )).toEqual({ status: "refused", reason: "delivery-locus-duplicate" });
  });

  it("routes attended absence and reviewed provisional intent with honest precomposed cost", async () => {
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies())).resolves.toMatchObject({
      status: "authoring-required",
      nextAction: "attend-authoring",
      laterEntryCostText: expect.stringContaining("later entry"),
      recommendedActionText: expect.any(String),
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "confirmed-reviewed",
    }, dependencies({
      taskList: `${prefix}## Delivery Plan\n\nReviewed slices.\n\n${suffix}`,
      authoring: "match",
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      nextAction: "canonicalize-provisional",
      authoringMapId: "map-1",
    });
  });

  it("distinguishes canonical unbound and coherent bound routes", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({ status: "resume-bound", stateRevision: 3 });
  });

  it("refuses ambiguity, incoherence, and unconfirmed provisional prose rather than treating them as absence", async () => {
    for (const deps of [
      dependencies({ resolvedPlan: "indeterminate" }),
      dependencies({ authoring: "indeterminate" }),
      dependencies({ taskList: `${prefix}## Delivery Plan\n\nUnconfirmed.\n\n${suffix}` }),
      dependencies({ taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}` }),
    ]) {
      const result = await inspectDeliveryEntry({
        workUnitId: plan.workUnitId,
        boundaryDisposition: "delivery-candidate",
        provisionalDisposition: "not-applicable",
      }, deps);
      expect(result.status).toBe("refused");
    }
  });

  it("returns not-applicable only for an explicit noncandidate with no authored evidence", async () => {
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "not-delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies())).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });
  });
});
