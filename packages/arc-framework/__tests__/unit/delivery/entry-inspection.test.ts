import { describe, expect, it, vi } from "vitest";

import {
  inspectDeliveryEntry,
  inspectDeliveryPlanLocus,
} from "../../../src/lib/delivery/entry-inspection.js";
import {
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "../../../src/lib/delivery/task-list-render.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { projectPublicationBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliveryStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const prefix = "# Task List\n\n";
const suffix = "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";

function dependencies(input: {
  taskList?: string;
  resolvedPlan?: typeof plan | null | "indeterminate";
  authoring?: "match" | "no-match" | "indeterminate";
  authoringPlanDigest?: string | null;
  state?: ReturnType<typeof deliveryStateFixture> | null | "refused";
  stateRevision?: number;
  integrationBoundary?: ReturnType<typeof projectPublicationBoundary> | "refused";
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
    readState: vi.fn().mockResolvedValue(input.state === "refused"
      ? { status: "refused" }
      : {
          status: "ok",
          value: input.state ?? null,
          revision: input.state ? input.stateRevision ?? 3 : null,
        }),
    readIntegrationBoundary: vi.fn().mockResolvedValue(input.integrationBoundary === "refused"
      ? { status: "refused" }
      : { status: "ok", value: input.integrationBoundary ?? null }),
  };
}

function stateWithActiveCorrection() {
  const state = deliveryStateFixture(plan);
  const selected = state.members[0]!;
  const before = {
    target: state.target,
    members: [{
      deliverableId: selected.deliverableId,
      ref: selected.ref,
      changeRequest: selected.changeRequest,
      coordinates: selected.coordinates,
    }],
  };
  const reserved = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
    operationId: "interrupted-entry-correction",
    kind: "rewrite",
    mode: "selected-change",
    affectedDeliverableIds: [selected.deliverableId],
    expectedStateRevision: 3,
    before,
    requested: before,
  });
  if (reserved.status !== "reserved") throw new Error("entry correction fixture must reserve");
  return reserved.state;
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

  it("selects integration from authoritative plan presence before delivery state exists", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({ status: "resume-bound", stateRevision: 3 });
  });

  it("selects private candidate preparation only when pre-publication has a canonical plan", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "prepublication",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      nextAction: "validate-eligibility",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "prepublication",
    }, dependencies())).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
      recommendedActionText: expect.stringContaining("singleton pre-publication"),
    });
  });

  it("consumes an exact pending publication action before bound position routing", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    const boundary = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/delivery-plan-record",
      candidateId: `sha256:${"a".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"b".repeat(64)}`,
      reservation: null,
      changeRequest: null,
    });
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
      integrationBoundary: boundary,
    }))).resolves.toMatchObject({
      status: "continue-publication",
      nextAction: "continue-publication",
      planId: plan.planId,
      stateRevision: 3,
      publicationAction: boundary.nextAction,
    });
  });

  it("refuses an unreadable pending-publication boundary before bound position routing", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
      integrationBoundary: "refused",
    }))).resolves.toMatchObject({
      status: "refused",
      reason: "evidence-unavailable",
    });
  });

  it("routes bound execution from the exact open parent task to its owning delivery member", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n\n"
      + "    - `[ ]` **1.1.R.a Repair the member**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({
        status: "correction-routing-required",
        nextAction: "plan-review-fix",
        planId: plan.planId,
        stateRevision: 3,
        selectedDeliverableId: plan.members[0]?.deliverableId,
        entryMode: "execution",
      });
  });

  it("resumes exact pending review-fix verification before correction replanning", async () => {
    const multiPlan = deliveryFourMemberStackPlanFixture();
    const selectedDeliverableId = multiPlan.members[0]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId, multiPlan.members[1]!.deliverableId];
    const state = {
      ...deliveryStateFixture(multiPlan),
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    } as unknown as ReturnType<typeof deliveryStateFixture>;
    const taskList = `${prefix}${renderDeliveryPlanSection(multiPlan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";

    await expect(inspectDeliveryEntry({
      workUnitId: multiPlan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList, resolvedPlan: multiPlan, state, stateRevision: 9 })))
      .resolves.toMatchObject({
        status: "review-fix-verification-required",
        nextAction: "verify-review-fix",
        planId: multiPlan.planId,
        stateRevision: 9,
        selectedDeliverableId,
        verification: {
          memberDeliverableIds,
          tier1Required: true,
        },
        acknowledgementInput: {
          planId: multiPlan.planId,
          selectedDeliverableId,
          memberDeliverableIds,
          expectedStateRevision: 9,
          continuationDigest: canonicalDigest(state),
        },
      });
  });

  it("resumes an active correction before planning another bound execution change", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: stateWithActiveCorrection(),
      stateRevision: 4,
    })))
      .resolves.toMatchObject({
        status: "resume-bound",
        nextAction: "read-position-and-reconcile",
        planId: plan.planId,
        stateRevision: 4,
      });
  });

  it("keeps unbound and work-unit-verification execution on the ordinary task route", async () => {
    const implementationTaskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList: implementationTaskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });

    const verificationTaskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 2:** Verification\n\n### `[ ]` **2.1 Verify**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({
      taskList: verificationTaskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
    }))).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });
  });

  it("continues singleton integration only from exact authored-evidence absence", async () => {
    const absent = dependencies();
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, absent)).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
      recommendedActionText: expect.stringContaining("singleton integration"),
    });
    expect(absent.readState).not.toHaveBeenCalled();

    const cases = [
      dependencies({ resolvedPlan: "indeterminate" }),
      dependencies({ authoring: "indeterminate" }),
      dependencies({ authoring: "match" }),
      dependencies({ taskList: `${prefix}## Delivery Plan\n\nUnconfirmed.\n\n${suffix}` }),
      dependencies({ taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}` }),
    ];
    for (const deps of cases) {
      await expect(inspectDeliveryEntry({
        workUnitId: plan.workUnitId,
        entryMode: "integrating",
      }, deps)).resolves.toMatchObject({ status: "refused" });
    }
  });

  it("recovers an interrupted canonical publication during integration from its exact receipt", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      authoringMapId: "map-1",
    });
  });

  it("refuses unavailable or incoherent state after integration selects a canonical plan", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    const incoherent = deliveryStateFixture(plan);
    incoherent.boundPlan.planDigest = `sha256:${"0".repeat(64)}`;

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
      state: "refused",
    })))
      .resolves.toMatchObject({ status: "refused", reason: "evidence-unavailable" });
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
      state: incoherent,
    })))
      .resolves.toMatchObject({ status: "refused", reason: "state-incoherent" });
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
