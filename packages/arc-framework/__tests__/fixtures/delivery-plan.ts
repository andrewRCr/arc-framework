import { bindDesignInventory } from "../../src/lib/delivery/design-inventory.js";
import { constructDeliveryPlanRevision } from "../../src/lib/delivery/plan.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanV1,
} from "../../src/lib/delivery/schema.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const defaultPlanId = "123e4567-e89b-42d3-a456-426614174000";

/** Construct a valid two-member plan for delivery-state and operation tests. */
export function deliveryPlanFixture(planId = defaultPlanId): DeliveryPlanV1 {
  const authoring = DeliveryPlanAuthoringInputV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    design: {
      artifacts: [{ artifactId: "spec-delivery-plan-record.md" }],
      elements: [{ elementId: "detailed:state-contract" }],
    },
    tasks: {
      implementation: [{ taskId: "1.1" }, { taskId: "1.2" }],
      verificationTaskId: "2.1",
    },
    entry: "from-tasks",
    projection: { kind: "wu-integration-target" },
    members: [{
      chunkKey: "first",
      title: "First member",
      contract: "Publish the first contract.",
      taskIds: ["1.1"],
      designElementIds: ["detailed:state-contract"],
      mainlineLandability: "integration-only",
    }, {
      chunkKey: "second",
      title: "Second member",
      contract: "Publish the second contract.",
      taskIds: ["1.2"],
      designElementIds: [],
      mainlineLandability: "integration-only",
    }],
    seams: [],
  });
  const design = bindDesignInventory({
    artifacts: [{
      artifactId: "spec-delivery-plan-record.md",
      revisionDigest: canonicalDigest({ source: "spec" }),
      form: "detailed",
      elements: [{ elementId: "state-contract", semanticDigest: canonicalDigest({ contract: "state" }) }],
    }],
  });
  if (design.status !== "bound") throw new Error("fixture design inventory must bind");
  const implementation = [
    { taskId: "1.1", semanticDigest: canonicalDigest({ goal: "First" }) },
    { taskId: "1.2", semanticDigest: canonicalDigest({ goal: "Second" }) },
  ];
  const result = constructDeliveryPlanRevision({
    authoring,
    taskInventory: {
      inventoryDigest: canonicalDigest(implementation),
      implementation,
      verificationTaskId: "2.1",
    },
    designInventory: design.inventory,
    predecessor: null,
    mintPlanId: () => planId,
  });
  if (result.status !== "constructed") throw new Error("fixture plan must construct");
  return result.plan;
}
