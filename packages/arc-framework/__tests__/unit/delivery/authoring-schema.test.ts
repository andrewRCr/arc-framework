import { describe, expect, it } from "vitest";

import {
  createDeliveryAuthoringSnapshot,
  DeliveryAuthoringSnapshotV1Schema,
} from "../../../src/lib/delivery/authoring-schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";

describe("delivery authoring snapshot", () => {
  it("pins source inputs, facts, inventories, identities, and their order", () => {
    const taskOneDigest = canonicalDigest({ goal: "First" });
    const taskTwoDigest = canonicalDigest({ goal: "Second" });
    const designRevision = canonicalDigest({ artifact: "spec.md" });
    const designElementDigest = canonicalDigest({ element: "req:first" });
    const snapshot = createDeliveryAuthoringSnapshot({
      mapId: "authoring-map",
      originalWorkUnitId: "delivery-plan-record",
      planId: PLAN_ID,
      expectedCurrentPlanDigest: null,
      design: {
        artifacts: [{ artifactId: "spec.md", revisionDigest: designRevision }],
        elements: [{ elementId: "requirements:first", semanticDigest: designElementDigest }],
      },
      tasks: {
        inventoryDigest: canonicalDigest([
          { taskId: "1.1", semanticDigest: taskOneDigest },
          { taskId: "1.2", semanticDigest: taskTwoDigest },
        ]),
        implementation: [
          { taskId: "1.1", semanticDigest: taskOneDigest },
          { taskId: "1.2", semanticDigest: taskTwoDigest },
        ],
        verificationTaskId: "2.1",
      },
      source: {
        entry: "from-tasks",
        inputs: { taskListPath: ".arc/active/tasks-delivery-plan-record.md" },
        facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1", "1.2"] }] },
        identitySequence: ["phase:1", "task:1.1", "task:1.2"],
      },
    });

    expect(DeliveryAuthoringSnapshotV1Schema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.source).toEqual({
      entry: "from-tasks",
      inputs: { taskListPath: ".arc/active/tasks-delivery-plan-record.md" },
      facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1", "1.2"] }] },
      identitySequence: ["phase:1", "task:1.1", "task:1.2"],
    });
    expect(snapshot.identityOrder).toEqual({
      designArtifactIds: ["spec.md"],
      designElementIds: ["requirements:first"],
      taskIds: ["1.1", "1.2", "2.1"],
      sourceIds: ["phase:1", "task:1.1", "task:1.2"],
    });
  });
});
