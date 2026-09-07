import { describe, expect, it } from "vitest";

import { canonicalDigest, SlugSchema } from "../../../src/lib/kernel/index.js";
import {
  prepareDeliveryFromTasksAuthoring,
  resolveDeliveryFromTasksProjection,
} from "../../../src/lib/delivery/from-tasks.js";
import {
  parseDeliveryAuthoringMap,
  type DeliveryAuthoringSlotsV1,
} from "../../../src/lib/delivery/authoring-map.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";
const DESIGN_DIGEST = canonicalDigest({ artifact: "spec-example.md" });

function taskList(): string {
  return [
    "# Task List: Example",
    "",
    "## Delivery Plan",
    "",
    "### `[ ]` **9.9 Provisional task-shaped member**",
    "",
    "- _Goal:_ This plan prose is not implementation inventory.",
    "",
    "## **Phase alpha:** First group",
    "",
    "### `[ ]` **9.4 First task**",
    "",
    "- _Goal:_ Implement the first behavior.",
    "",
    "## **Phase beta:** Second group",
    "",
    "### `[ ]` **1.2 Close the first member** — validate criteria at member scope",
    "",
    "- _Goal:_ Implement the second behavior.",
    "",
    "## **Phase verify:** Verification",
    "",
    "### `[ ]` **7.9 Verify the work unit**",
    "",
  ].join("\n");
}

function designInventory(): unknown {
  return {
    artifacts: [{
      artifactId: "spec-example.md",
      revisionDigest: DESIGN_DIGEST,
      form: "detailed",
      elements: [{
        elementId: "deliverable-contract",
        semanticDigest: canonicalDigest({ requirement: "deliverable contract" }),
      }],
    }],
  };
}

function prepare() {
  return prepareDeliveryFromTasksAuthoring({
    mapId: "authoring-map",
    planId: PLAN_ID,
    workUnitId: "example",
    expectedCurrentPlanDigest: null,
    taskListPath: ".arc/active/tasks-example.md",
    taskListContent: taskList(),
    designInventory: designInventory(),
  });
}

function member(chunkKey: string): DeliveryAuthoringSlotsV1["members"][number] {
  return {
    chunkKey: SlugSchema.parse(chunkKey),
    title: `${chunkKey} member`,
    contract: `${chunkKey} contract`,
    designElementIds: ["detailed:deliverable-contract"],
    mainlineLandability: "independently-landable",
  };
}

describe("prepareDeliveryFromTasksAuthoring", () => {
  it("pins the strict design and flat parent-task inventories in the starter map", () => {
    const result = prepare();

    expect(result).toMatchObject({
      status: "prepared",
      snapshot: {
        design: {
          artifacts: [{ artifactId: "spec-example.md", revisionDigest: DESIGN_DIGEST }],
          elements: [{ elementId: "detailed:deliverable-contract" }],
        },
        tasks: {
          parents: [
            { taskId: "9.4", role: { kind: "implementation" } },
            { taskId: "1.2", role: { kind: "verification", scope: "member" } },
            { taskId: "7.9", role: { kind: "verification", scope: "work-unit" } },
          ],
        },
      },
    });
    if (result.status !== "prepared") return;
    expect(result.markdown).toContain('"scope": "work-unit"');
    expect(result.markdown).toContain('"eligibleForMembership": false');
  });

  it("derives phase groups from scanner order rather than task-id spelling", () => {
    const result = prepare();

    expect(result).toMatchObject({
      status: "prepared",
      snapshot: {
        source: {
          facts: {
            phaseGroups: [
              { phaseId: "alpha", title: "First group", taskIds: ["9.4"] },
              { phaseId: "beta", title: "Second group", taskIds: ["1.2"] },
            ],
            membershipEligibility: [
              { taskId: "9.4", eligibleForMembership: true },
              { taskId: "1.2", eligibleForMembership: true },
              { taskId: "7.9", eligibleForMembership: false },
            ],
          },
        },
      },
    });
  });

  it("leaves both boundary arms unselected in the starter map", () => {
    const result = prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    const parsed = parseDeliveryAuthoringMap(result.markdown);
    expect(parsed.status).toBe("parsed");
    if (parsed.status !== "parsed") return;
    expect(parsed.slots).toMatchObject({ boundary: null });
  });

  it("expands phase alignment from scanner groups deterministically", () => {
    const result = prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    const projection = resolveDeliveryFromTasksProjection({
      snapshot: result.snapshot,
      slots: {
        projection: { kind: "stack-to-main" },
        boundary: { kind: "phase-aligned" },
        members: [member("first"), member("second")],
        seams: [],
      },
    });

    expect(projection).toMatchObject({
      status: "resolved",
      projection: {
        authoring: {
          members: [
            { chunkKey: "first", taskIds: ["9.4"] },
            { chunkKey: "second", taskIds: ["1.2"] },
          ],
        },
        memberContributionSteps: [
          { chunkKey: "first", contributionStepIds: ["9.4"] },
          { chunkKey: "second", contributionStepIds: ["1.2"] },
        ],
      },
    });
  });

  it("passes explicit boundaries through and accepts a cross-phase member without justification", () => {
    const result = prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    const projection = resolveDeliveryFromTasksProjection({
      snapshot: result.snapshot,
      slots: {
        projection: { kind: "wu-integration-target" },
        boundary: {
          kind: "explicit",
          segments: [{ chunkKey: SlugSchema.parse("combined"), sourceIds: ["9.4", "1.2"] }],
        },
        members: [member("combined")],
        seams: [],
      },
    });

    expect(projection).toMatchObject({
      status: "resolved",
      projection: {
        authoring: {
          members: [{ chunkKey: "combined", taskIds: ["9.4", "1.2"] }],
        },
        memberContributionSteps: [{
          chunkKey: "combined",
          contributionStepIds: ["9.4", "1.2"],
        }],
      },
    });
  });

  it("refuses the work-unit verifier as an explicit member source", () => {
    const result = prepare();
    expect(result.status).toBe("prepared");
    if (result.status !== "prepared") return;
    expect(resolveDeliveryFromTasksProjection({
      snapshot: result.snapshot,
      slots: {
        projection: { kind: "wu-integration-target" },
        boundary: {
          kind: "explicit",
          segments: [{ chunkKey: SlugSchema.parse("verification"), sourceIds: ["7.9"] }],
        },
        members: [member("verification")],
        seams: [],
      },
    })).toEqual({ status: "refused", reason: "work-unit-verification-task-ineligible" });
  });

  it("refuses malformed design input without producing authoring material", () => {
    expect(prepareDeliveryFromTasksAuthoring({
      mapId: "authoring-map",
      planId: PLAN_ID,
      workUnitId: "example",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-example.md",
      taskListContent: taskList(),
      designInventory: { artifacts: [] },
    })).toEqual({ status: "refused", reason: "invalid-design-inventory" });
  });
});
