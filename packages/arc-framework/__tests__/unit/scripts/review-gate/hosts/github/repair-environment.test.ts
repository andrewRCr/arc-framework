import { describe, expect, it } from "vitest";

import {
  provisionRepairEnvironment,
  verifyRepairEnvironment,
} from "../../../../../../src/scripts/review-gate/hosts/github/repair-environment.js";

function state(overrides: Record<string, unknown> = {}) {
  return {
    exists: true,
    name: "review-gate-repair",
    protectedBranches: false,
    customBranchPolicies: true,
    branchPolicies: [{ name: "main", type: "branch" as const }],
    secretNames: [],
    ...overrides,
  };
}

describe("repair environment contract", () => {
  it("accepts only one secretless exact-default-branch deployment policy", () => {
    expect(verifyRepairEnvironment(state(), "main")).toEqual([]);
    expect(verifyRepairEnvironment(state({ secretNames: ["TOKEN"] }), "main"))
      .toContain("repair-environment-not-secretless");
    expect(verifyRepairEnvironment(state({ branchPolicies: [{ name: "feature", type: "branch" }] }), "main"))
      .toContain("repair-environment-default-branch-policy-mismatch");
  });

  it("compares without mutation and applies only repairable policy drift", async () => {
    let current = state({ exists: false, branchPolicies: [] });
    const api = {
      read: async () => current,
      upsert: async () => { current = state({ branchPolicies: [] }); },
      replaceBranchPolicies: async (names: string[]) => {
        current = state({ branchPolicies: names.map((name) => ({ name, type: "branch" as const })) });
      },
    };
    await expect(provisionRepairEnvironment("compare", "main", api)).resolves.toMatchObject({
      status: "stop",
      errors: expect.arrayContaining(["repair-environment-missing"]),
    });
    await expect(provisionRepairEnvironment("apply", "main", api)).resolves.toEqual({ status: "ready", errors: [] });
  });

  it("refuses to mutate a non-secretless environment", async () => {
    const api = {
      read: async () => state({ secretNames: ["TOKEN"] }),
      upsert: async () => { throw new Error("must not mutate"); },
      replaceBranchPolicies: async () => { throw new Error("must not mutate"); },
    };
    await expect(provisionRepairEnvironment("apply", "main", api)).resolves.toMatchObject({
      status: "stop",
      errors: ["repair-environment-not-secretless"],
    });
  });
});
