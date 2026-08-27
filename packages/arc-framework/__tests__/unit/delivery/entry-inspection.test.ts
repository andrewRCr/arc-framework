import { describe, expect, it, vi } from "vitest";

import {
  inspectDeliveryEntry,
  inspectDeliveryPlanLocus,
} from "../../../src/lib/delivery/entry-inspection.js";
import {
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "../../../src/lib/delivery/task-list-render.js";
import { deliveryStackPlanFixture } from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const prefix = "# Task List\n\n";
const suffix = "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";
const stateFailures = [
  "record-malformed",
  "identity-mismatch",
  "version-conflict",
  "ambiguous-match",
  "namespace-corrupt",
] as const;

function dependencies(input: {
  taskList?: string;
  resolvedPlan?: typeof plan | null | "indeterminate";
  authoring?: "match" | "no-match" | "indeterminate";
  authoringPlanDigest?: string | null;
  state?: ReturnType<typeof deliveryStateFixture> | null;
  stateFailure?: (typeof stateFailures)[number];
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
        ? {
            status: "match",
            mapId: "map-1",
            candidatePlanDigest: input.authoringPlanDigest ?? null,
          }
        : { status: "no-match" }),
    readState: vi.fn().mockResolvedValue(input.stateFailure === undefined
      ? { status: "ok", value: input.state ?? null, revision: input.state ? 3 : null }
      : { status: "refused", reason: input.stateFailure }),
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
    expect(inspectDeliveryPlanLocus(
      `${prefix}${DELIVERY_PLAN_START_SENTINEL}\n## Delivery Plan\n\n${suffix}`,
      null,
    )).toEqual({ status: "refused", reason: "delivery-locus-malformed" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}${renderDeliveryPlanSection(plan).replace(
        "<!-- arc:delivery-plan:end -->",
        "Unexpected projection bytes.\n<!-- arc:delivery-plan:end -->",
      )}${suffix}`,
      plan,
    )).toEqual({ status: "refused", reason: "canonical-projection-mismatch" });
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

  it.each(stateFailures)("preserves the %s delivery-state refusal", async (stateFailure) => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({ taskList, resolvedPlan: plan, stateFailure }))).resolves.toMatchObject({
      status: "refused",
      nextAction: "stop",
      reason: `state-${stateFailure}`,
      recommendedActionText: expect.stringContaining("delivery state"),
    });
  });

  it("recovers a canonical plan only from its exact authoring receipt", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      authoringMapId: "map-1",
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: `sha256:${"0".repeat(64)}`,
    }))).resolves.toMatchObject({ status: "refused", reason: "evidence-conflict" });
  });

  it("refuses ambiguity, incoherence, and unconfirmed provisional prose rather than treating them as absence", async () => {
    const cases = [
      dependencies({ resolvedPlan: "indeterminate" }),
      dependencies({ authoring: "indeterminate" }),
      dependencies({ taskList: `${prefix}## Delivery Plan\n\nUnconfirmed.\n\n${suffix}` }),
      dependencies({ taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}` }),
    ];
    const reasons = [
      "evidence-unavailable",
      "evidence-unavailable",
      "provisional-unconfirmed",
      "canonical-plan-missing",
    ];
    for (const [index, deps] of cases.entries()) {
      const result = await inspectDeliveryEntry({
        workUnitId: plan.workUnitId,
        boundaryDisposition: "delivery-candidate",
        provisionalDisposition: "not-applicable",
      }, deps);
      expect(result).toMatchObject({ status: "refused", reason: reasons[index] });
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
