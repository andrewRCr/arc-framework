import { describe, expect, it } from "vitest";

import { SELF_HOSTING_REVIEW_GATE } from "../../../../../src/scripts/review-gate/runtime/entrypoints.js";
import { SELF_HOSTING_EXECUTABLE_OPERATIONS } from "../../../../../src/scripts/review-gate/runtime/operations.js";

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
      "projectForwardReviewContract",
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

  it("declares one closed descriptor for every launcher operation", () => {
    expect(Object.isFrozen(SELF_HOSTING_EXECUTABLE_OPERATIONS)).toBe(true);
    expect(Object.keys(SELF_HOSTING_EXECUTABLE_OPERATIONS).sort()).toEqual([
      "assert-head-mutable", "attest", "await", "discover", "next-action", "perform-action", "qualify",
      "qualify-token", "reconcile", "repair-environment", "validate-repair",
    ]);
    for (const operation of Object.values(SELF_HOSTING_EXECUTABLE_OPERATIONS)) {
      expect(operation.registryKeys.every((key) => key in SELF_HOSTING_REVIEW_GATE)).toBe(true);
    }
  });

  it("keeps malformed repair input fail-closed through the assembled parser", () => {
    expect(() => SELF_HOSTING_REVIEW_GATE.parseRepairDispatchEvent({ action: "review-gate-repair" }))
      .toThrow(/repairEvent.repository/u);
  });
});
