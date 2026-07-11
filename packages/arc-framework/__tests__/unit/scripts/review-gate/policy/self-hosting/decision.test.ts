import { describe, expect, it } from "vitest";

import { resolveSelfHostingDecision } from "../../../../../../src/scripts/review-gate/policy/self-hosting/decision.js";
import { SELF_HOSTING_POLICY } from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const changeRequest = {
  schemaVersion: 1 as const,
  repositoryId: "repo-1",
  changeRequestId: "change-7",
  hostRef: "opaque-change-7",
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: "b".repeat(40),
  headSha: "c".repeat(40),
  changeSetId: "d".repeat(64),
};

describe("aggregate self-hosting policy decision", () => {
  it.each([
    ["auto", "sensitive", "exempt", 0],
    ["reviewed", "routine", "recommended", 1],
    ["reviewed", "sensitive", "required", 1],
  ] as const)("maps %s/%s to %s", (lane, risk, disposition, requirementCount) => {
    const decision = resolveSelfHostingDecision({
      policy: SELF_HOSTING_POLICY,
      changeRequest,
      lane: { lane, reasons: lane === "auto" ? ["author-owned-artifacts"] : ["non-lane-path"] },
      risk: { risk, reasons: risk === "sensitive" ? ["code-surface"] : ["routine-doc-surface"] },
    });

    expect(decision.disposition).toBe(disposition);
    expect(decision.requirements).toHaveLength(requirementCount);
    if (requirementCount > 0) {
      expect(decision.requirements[0]?.obligation).toBe(disposition === "required" ? "required" : "recommended");
    }
  });

  it("does not accept mutable CI weight as policy input", () => {
    const decision = resolveSelfHostingDecision({
      policy: SELF_HOSTING_POLICY,
      changeRequest,
      lane: { lane: "reviewed", reasons: ["non-lane-path"] },
      risk: { risk: "sensitive", reasons: ["code-surface"] },
    });

    expect(decision).not.toHaveProperty("ciWeight");
    expect(decision).not.toHaveProperty("capacity");
  });

  it("changes policy binding when canonical policy data changes", () => {
    const input = {
      changeRequest,
      lane: { lane: "reviewed" as const, reasons: ["non-lane-path" as const] },
      risk: { risk: "sensitive" as const, reasons: ["code-surface" as const] },
    };
    const original = resolveSelfHostingDecision({ ...input, policy: SELF_HOSTING_POLICY });
    const changed = resolveSelfHostingDecision({
      ...input,
      policy: { ...SELF_HOSTING_POLICY, semanticsVersion: "self-hosting-review/v2" },
    });

    expect(changed.policyVersion).not.toBe(original.policyVersion);
    expect(changed.requirements[0]?.policyVersion).toBe(changed.policyVersion);
  });
});
