/** Live merge-method policy resolution behavior. */

import { describe, expect, it } from "vitest";

import {
  resolveMergeMethod,
  type MergeMethodPolicyPort,
} from "../../../../src/scripts/review-gate/merge-method.js";

function port(policy: Record<"merge" | "rebase" | "squash", boolean>): MergeMethodPolicyPort {
  return {
    resolveRepository: async () => "owner/repo",
    readPolicy: async () => policy,
  };
}

describe("merge-method resolution", () => {
  it("validates an allowed configured method with a policy fingerprint", async () => {
    await expect(resolveMergeMethod("squash", port({
      merge: true,
      rebase: false,
      squash: true,
    }))).resolves.toMatchObject({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      state: "validated",
      nextAction: "use-method",
      method: "squash",
      allowedMethods: ["merge", "squash"],
      policyFingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
  });

  it("blocks a disallowed method and names the configured and allowed values", async () => {
    await expect(resolveMergeMethod("rebase", port({
      merge: true,
      rebase: false,
      squash: true,
    }))).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "method-disallowed",
      configuredMethod: "rebase",
      allowedMethods: ["merge", "squash"],
      remedy: { argv: ["arc", "review", "merge-method", "resolve", "--json"] },
    });
  });

  it("stops instead of choosing a fallback when repository policy is unreadable", async () => {
    await expect(resolveMergeMethod("squash", {
      ...port({ merge: true, rebase: true, squash: true }),
      readPolicy: async () => { throw new Error("policy unavailable"); },
    })).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "policy-unreadable",
      configuredMethod: "squash",
      allowedMethods: [],
      remedy: { argv: ["arc", "review", "merge-method", "resolve", "--json"] },
    });
  });

  it("changes the fingerprint when live merge policy changes", async () => {
    const first = await resolveMergeMethod("merge", port({ merge: true, rebase: false, squash: true }));
    const second = await resolveMergeMethod("merge", port({ merge: true, rebase: true, squash: true }));

    expect(first).toMatchObject({ state: "validated" });
    expect(second).toMatchObject({ state: "validated" });
    expect(first.policyFingerprint).not.toBe(second.policyFingerprint);
  });
});
