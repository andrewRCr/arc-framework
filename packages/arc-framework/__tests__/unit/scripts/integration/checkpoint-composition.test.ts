import { describe, expect, it } from "vitest";

import {
  checkpointBaseIsAccepted,
} from "../../../../src/scripts/integration/checkpoint-composition.js";

describe("integration checkpoint composition", () => {
  it("accepts the configured base and a validated delivery-member predecessor", () => {
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "main",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: [],
    })).toBe(true);
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "delivery/example/member-1",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: ["delivery/example/member-1"],
    })).toBe(true);
  });

  it("rejects a base that neither authority admitted", () => {
    expect(checkpointBaseIsAccepted({
      candidateBaseRef: "unrelated",
      configuredBaseRef: "main",
      acceptableDeliveryBaseRefs: ["delivery/example/member-1"],
    })).toBe(false);
  });
});
