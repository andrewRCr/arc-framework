import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  prepareDeliveryFromTasksAuthoring,
} from "../../../src/lib/delivery/from-tasks.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";
const DESIGN_DIGEST = canonicalDigest({ artifact: "spec-example.md" });

function taskList(): string {
  return [
    "# Task List: Example",
    "",
    "## **Phase alpha:** First group",
    "",
    "### `[ ]` **9.4 First task**",
    "",
    "- _Goal:_ Implement the first behavior.",
    "",
    "## **Phase beta:** Second group",
    "",
    "### `[ ]` **1.2 Second task**",
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

describe("prepareDeliveryFromTasksAuthoring", () => {
  it("pins the strict design and flat parent-task inventories in the starter map", () => {
    const result = prepareDeliveryFromTasksAuthoring({
      mapId: "authoring-map",
      planId: PLAN_ID,
      workUnitId: "example",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-example.md",
      taskListContent: taskList(),
      designInventory: designInventory(),
    });

    expect(result).toMatchObject({
      status: "prepared",
      snapshot: {
        design: {
          artifacts: [{ artifactId: "spec-example.md", revisionDigest: DESIGN_DIGEST }],
          elements: [{ elementId: "detailed:deliverable-contract" }],
        },
        tasks: {
          implementation: [{ taskId: "9.4" }, { taskId: "1.2" }],
          verificationTaskId: "7.9",
        },
      },
    });
    if (result.status !== "prepared") return;
    expect(result.markdown).toContain('"verificationTaskId": "7.9"');
    expect(result.markdown).toContain('"eligibleForMembership": false');
  });

  it("derives phase groups from scanner order rather than task-id spelling", () => {
    const result = prepareDeliveryFromTasksAuthoring({
      mapId: "authoring-map",
      planId: PLAN_ID,
      workUnitId: "example",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-example.md",
      taskListContent: taskList(),
      designInventory: designInventory(),
    });

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
