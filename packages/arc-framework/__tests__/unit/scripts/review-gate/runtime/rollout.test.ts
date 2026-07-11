import { describe, expect, it } from "vitest";

import type { GateProjection } from "../../../../../src/scripts/review-gate/core/execution.js";
import { applyContextMutation, parseContextMode, planContextTransition, projectContexts, validateOutageRecovery } from "../../../../../src/scripts/review-gate/runtime/rollout.js";

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

  it("requires an independent, bypass-free outage repair chain", () => {
    expect(validateOutageRecovery({ currentGreen: ["merge-ok"], ciOkExactHead: true, mergeFrozen: true, auditCaptured: true, repairTouchesCiProducer: false, projectActionsSuspended: true, independentRepairReview: true, adminBypass: false })).toEqual([]);
    expect(validateOutageRecovery({ currentGreen: [], ciOkExactHead: true, mergeFrozen: true, auditCaptured: true, repairTouchesCiProducer: true, projectActionsSuspended: false, independentRepairReview: false, adminBypass: true })).toEqual([
      "repair-touches-ci-producer", "project-actions-active", "independent-review-missing", "admin-bypass-prohibited",
    ]);
  });
});
