import { describe, expect, it } from "vitest";

import { computePolicyVersion } from "../../../../../../src/scripts/review-gate/core/identity.js";
import {
  parseSelfHostingPolicy,
  SELF_HOSTING_POLICY,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

describe("self-hosting review policy document", () => {
  it("returns the pinned App-bot user id", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.providerIdentities.appBotUserId).toBe("302312524");
  });

  it.each([
    ["missing", { coderabbitBotUserId: SELF_HOSTING_POLICY.providerIdentities.coderabbitBotUserId }],
    ["non-numeric", { ...SELF_HOSTING_POLICY.providerIdentities, appBotUserId: "arc-review-gate[bot]" }],
    ["extra-key", { ...SELF_HOSTING_POLICY.providerIdentities, appBotUserIdAlias: "302312524" }],
  ])("rejects a %s App-bot provider identity", (_name, providerIdentities) => {
    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, providerIdentities })).toThrow();
  });

  it("validates and hashes canonical policy data deterministically", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed).toEqual(SELF_HOSTING_POLICY);
    expect(computePolicyVersion({ policy: parsed })).toBe(computePolicyVersion({ policy: SELF_HOSTING_POLICY }));
  });

  it.each([
    ["lane predicate", { lanePredicate: { ...SELF_HOSTING_POLICY.lanePredicate, id: "owner/v2" } }],
    ["risk predicate", { riskPredicate: { ...SELF_HOSTING_POLICY.riskPredicate, id: "risk/v2" } }],
    ["lane parameters", { lanePredicate: { ...SELF_HOSTING_POLICY.lanePredicate, artifactKinds: ["spec"] } }],
    ["semantics version", { semanticsVersion: "" }],
    ["rollout mode", { rolloutMode: "shadow" }],
    ["capacity", { capacity: "available" }],
    ["provider identity", { providerIdentities: { coderabbitBotUserId: "coderabbitai[bot]" } }],
  ])("rejects unknown or mutable %s", (_name, override) => {
    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, ...override })).toThrow();
  });

  it("rejects executable policy values", () => {
    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, evaluator: () => true })).toThrow();
  });
});
