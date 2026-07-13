import { describe, expect, it } from "vitest";

import { SELF_HOSTING_REVIEW_GATE } from "../../../../../src/scripts/review-gate/runtime/entrypoints.js";

describe("self-hosting review-gate entrypoint assembly", () => {
  it("closes every private executable operation behind one immutable assembly", () => {
    expect(Object.isFrozen(SELF_HOSTING_REVIEW_GATE)).toBe(true);
    expect(Object.keys(SELF_HOSTING_REVIEW_GATE).sort()).toEqual([
      "createAttestRuntime",
      "createReadOnlyHeadMutabilityReader",
      "createReadOnlyNextActionReader",
      "createReconcileRuntime",
      "ensureDirectReply",
      "ensureThreadResolution",
      "parseRepairDispatchEvent",
      "provisionRepairEnvironment",
      "recordProviderClosure",
      "runAssertHeadMutable",
      "runAttestMain",
      "runAwaitMain",
      "runDiscoveryMain",
      "runNextAction",
      "runPerformAction",
      "runQualification",
      "runReconcileMain",
      "runTokenQualification",
      "settleFixedFinding",
      "settleNonFixFinding",
      "validateRepairDispatch",
    ]);
    expect(Object.values(SELF_HOSTING_REVIEW_GATE).every((entrypoint) => typeof entrypoint === "function")).toBe(true);
  });

  it("keeps malformed repair input fail-closed through the assembled parser", () => {
    expect(() => SELF_HOSTING_REVIEW_GATE.parseRepairDispatchEvent({ action: "review-gate-repair" }))
      .toThrow(/repairEvent.repository/u);
  });
});
