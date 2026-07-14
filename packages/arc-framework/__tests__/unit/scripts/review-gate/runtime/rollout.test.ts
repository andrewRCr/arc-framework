import { describe, expect, it } from "vitest";

import type { GateProjection } from "../../../../../src/scripts/review-gate/core/execution.js";
import {
  applyContextMutation,
  parseContextMode,
  planContextTransition,
  projectContexts,
  validateOutageRecovery,
  validateOutageRestoration,
} from "../../../../../src/scripts/review-gate/runtime/rollout.js";

const projection = { schemaVersion: 1, conclusion: "success" } as GateProjection;

describe("review-gate context rollout", () => {
  it("defaults invalid configuration to shadow and preserves verdict identity", () => {
    expect(parseContextMode(undefined)).toBe("shadow");
    expect(parseContextMode("unsafe")).toBe("shadow");
    expect(projectContexts("shadow", projection)).toEqual([{ name: "review-gate-shadow", projection }]);
    expect(projectContexts("dual", projection).map(({ name }) => name)).toEqual(["review-gate-shadow", "merge-ok"]);
    expect(projectContexts("final", projection)).toEqual([{ name: "merge-ok", projection }]);
  });

  it("renders truthful promotion and rollback guards", () => {
    const promotion = planContextTransition("shadow", "dual");
    expect(promotion).toMatchObject({ currentRequired: ["merge-ok"], nextRequired: ["merge-ok", "review-gate-shadow"], add: ["review-gate-shadow"], remove: [], rollbackMode: "shadow" });
    expect(promotion.verificationProbes).toEqual(["merge-ok:exact-head:green", "review-gate-shadow:exact-head:green"]);
    expect(planContextTransition("final", "shadow").rollbackMode).toBe("final");
  });

  it("rejects empty required sets and producer overlap", () => {
    expect(() => applyContextMutation({ proven: ["merge-ok"], remove: "merge-ok" })).toThrow("cannot-remove-last");
    expect(() => applyContextMutation({ proven: ["merge-ok"], add: "merge-ok", producerOverlap: true })).toThrow("producer-overlap");
    expect(applyContextMutation({ proven: ["merge-ok"], add: "review-gate-shadow" })).toEqual(["merge-ok", "review-gate-shadow"]);
  });

  const ordinaryRepair = {
    currentGreen: ["merge-ok"] as const,
    ciOkExactHead: true,
    mergeFrozen: true,
    auditCaptured: true,
    repairChangesCiProducer: false,
    projectActionsSuspended: true,
    independentRepairReview: true,
    repairEnvironmentProven: true,
    exclusiveWriterProven: true,
    repairStatusExactHead: true,
    repairStatusSourceProven: true,
    appContextStillRequired: true,
    adminBypass: false,
  };

  it("accepts an ordinary repair with the complete add-before-remove proof", () => {
    expect(validateOutageRecovery({ ...ordinaryRepair, currentGreen: [...ordinaryRepair.currentGreen] })).toEqual([]);
  });

  it("accepts a CI-producer repair only with separate unchanged independent proof", () => {
    expect(validateOutageRecovery({
      ...ordinaryRepair,
      currentGreen: [...ordinaryRepair.currentGreen],
      ciOkExactHead: false,
      repairChangesCiProducer: true,
      independentCiProof: {
        exactHead: true,
        producerUnchanged: true,
        reviewerIndependent: true,
        producedByRepairChange: false,
      },
    })).toEqual([]);
  });

  it("refuses a CI-producer repair without every independent proof arm", () => {
    expect(validateOutageRecovery({
      ...ordinaryRepair,
      currentGreen: [...ordinaryRepair.currentGreen],
      ciOkExactHead: false,
      repairChangesCiProducer: true,
    })).toEqual([
      "independent-ci-exact-head-not-proven",
      "independent-ci-producer-not-unchanged",
      "independent-ci-review-missing",
    ]);
  });

  it("refuses a CI producer's self-proof and removal-first recovery", () => {
    expect(validateOutageRecovery({
      ...ordinaryRepair,
      currentGreen: [],
      repairChangesCiProducer: true,
      independentCiProof: {
        exactHead: true,
        producerUnchanged: true,
        reviewerIndependent: true,
        producedByRepairChange: true,
      },
      appContextStillRequired: false,
      adminBypass: true,
    })).toEqual([
      "current-context-not-green",
      "repair-ci-self-proof-prohibited",
      "app-context-removed-before-repair-proof",
      "admin-bypass-prohibited",
    ]);
  });

  it("requires restored App proof before emergency authority is removed", () => {
    expect(validateOutageRestoration({
      mergeFrozen: true,
      auditCaptured: true,
      restoredAppExactHead: true,
      restoredAppSourceProven: true,
      repairContextStillRequired: true,
      adminBypass: false,
    })).toEqual([]);
    expect(validateOutageRestoration({
      mergeFrozen: true,
      auditCaptured: true,
      restoredAppExactHead: false,
      restoredAppSourceProven: false,
      repairContextStillRequired: false,
      adminBypass: false,
    })).toEqual([
      "restored-app-head-not-proven",
      "restored-app-source-not-proven",
      "repair-context-removed-before-app-proof",
    ]);
  });
});
