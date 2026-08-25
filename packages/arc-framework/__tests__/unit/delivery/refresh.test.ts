import { describe, expect, it } from "vitest";

import { planDeliverySuffixRefresh } from "../../../src/lib/delivery/refresh.js";
import { deliveryFourMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";

const plan = deliveryFourMemberStackPlanFixture();
const ids = plan.members.map(({ deliverableId }) => deliverableId);
const common = {
  plan,
  landedPrefix: [ids[0]!],
  providerMovement: "stable" as const,
};

describe("delivery suffix refresh planning", () => {
  it("keeps base movement advisory and emits the exact remaining registered suffix", () => {
    expect(planDeliverySuffixRefresh({
      ...common,
      trigger: { kind: "base-moved" },
    })).toMatchObject({
      status: "disclosed",
      plannedSuffix: [ids[1], ids[2]],
    });
  });

  it.each([
    ["conflict"],
    ["native-stale-suffix"],
    ["host-up-to-date"],
  ] as const)("requires refresh after a refused %s landing", (reason) => {
    const result = planDeliverySuffixRefresh({
      ...common,
      trigger: { kind: "landing-refused", reason, mechanics: "provider-invoked" },
    });
    expect(result).toMatchObject({
      status: "refresh-required",
      mechanics: "provider-invoked",
      plannedSuffix: [ids[1], ids[2]],
    });
    expect(result.recommendedActionText).toMatch(/safety/iu);
    expect(result.recommendedActionText).toMatch(/review invalidation/iu);
  });

  it("refuses ambiguous provider movement", () => {
    expect(planDeliverySuffixRefresh({
      ...common,
      trigger: { kind: "operator-choice", mechanics: "operator-initiated" },
      providerMovement: "ambiguous",
    })).toMatchObject({ status: "refused", reason: "ambiguous-provider-movement" });
  });

  it("refuses a rewritten target", () => {
    expect(planDeliverySuffixRefresh({
      ...common,
      trigger: { kind: "operator-choice", mechanics: "operator-initiated" },
      providerMovement: "target-rewritten",
    })).toMatchObject({ status: "refused", reason: "target-rewritten" });
  });

  it("allows explicit operator choice without a refused landing", () => {
    expect(planDeliverySuffixRefresh({
      ...common,
      trigger: { kind: "operator-choice", mechanics: "operator-initiated" },
    })).toMatchObject({
      status: "refresh-required",
      mechanics: "operator-initiated",
      plannedSuffix: [ids[1], ids[2]],
    });
  });
});
