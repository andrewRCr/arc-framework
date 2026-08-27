import { describe, expect, it } from "vitest";

import { deriveDeliveryResidueLocators } from "../../../src/lib/delivery/residue-reaping.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";

describe("delivery authoring residue locators", () => {
  it("derives only the reserved candidate namespace and Git-common gate paths", () => {
    const plan = deliveryThreeMemberStackPlanFixture();
    const derived = deriveDeliveryResidueLocators(plan, "/repo/.git");
    expect(derived).toEqual({
      status: "derived",
      locators: plan.members.map((member) => ({
        deliverableId: member.deliverableId,
        candidateRef: `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`,
        gatePath: `/repo/.git/arc/delivery-gates/${plan.planId}/${member.chunkKey}`,
      })),
    });
  });
});
