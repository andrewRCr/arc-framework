import { describe, expect, it } from "vitest";

import { computePolicyVersion } from "../../../../../../src/scripts/review-gate/core/identity.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../../../../../src/scripts/review-gate/policy/standard-review.js";
import {
  deriveAcceptedReviewerClaims,
  parseSelfHostingPolicy,
  SELF_HOSTING_POLICY,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

describe("self-hosting review policy document", () => {
  it("binds explicit channels and keeps live controller authority inactive", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.reviewChannel).toBe("both");
    expect(parsed.controllerAuthority).toBe("inactive");
    expect(parsed.mergeAuthority).toBe("manual");
  });

  it("binds every source to native guidance, admission, request, and attestation identities", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));
    const byIdentity = new Map(parsed.qualifications.map((source) => [source.sourceIdentity, source]));

    expect(byIdentity.get("codex-cli")).toMatchObject({
      channel: "local",
      guidance: {
        baselineVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
        baselineDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        projectAugmentationId: "self-hosting-review/v1",
      },
      admissionMode: "checkpoint",
      requestMechanism: "local-attestation",
      attestationAuthority: "local-receipt-store",
      hostedImportAuthority: "arc-review-gate-app",
      closureCapability: true,
    });
    expect(byIdentity.get("coderabbit-pr")).toMatchObject({
      channel: "hosted",
      admissionMode: "automatic",
      requestMechanism: "provider-automatic",
      attestationAuthority: "arc-review-gate-app",
      hostedImportAuthority: null,
    });
    expect(byIdentity.get("codex-pr")).toMatchObject({
      channel: "hosted",
      admissionMode: "checkpoint",
      requestMechanism: "pr-author-command",
      attestationAuthority: "arc-review-gate-app",
    });
    expect(byIdentity.get("qualified-non-author-human")).toMatchObject({
      channel: "local",
      admissionMode: "checkpoint",
      requestMechanism: "human-attestation",
      attestationAuthority: "local-receipt-store",
    });
  });

  it("binds ordinary minor findings to the package-default record-only policy", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.minorGating).toBe("record-only");
  });

  it("returns the closed lifecycle-tail predicate", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.lifecycleTailPredicate).toEqual({ id: "lifecycle-bookkeeping-tail/v1" });
  });

  it.each([
    ["missing", undefined],
    ["unknown", { id: "lifecycle-bookkeeping-tail/v2" }],
    ["extended", { id: "lifecycle-bookkeeping-tail/v1", storageMode: "git" }],
  ])("rejects a %s lifecycle-tail predicate", (_name, lifecycleTailPredicate) => {
    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, lifecycleTailPredicate })).toThrow();
  });

  it("includes the lifecycle-tail predicate in policy versioning", () => {
    const legacyPolicy = Object.fromEntries(
      Object.entries(SELF_HOSTING_POLICY).filter(([key]) => key !== "lifecycleTailPredicate"),
    );

    expect(computePolicyVersion({ policy: SELF_HOSTING_POLICY })).not.toBe(
      computePolicyVersion({ policy: legacyPolicy }),
    );
  });

  it("returns pinned attestation enforcement values", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.attestationEnforcement).toEqual({
      acceptedRuntimeKinds: {
        "codex-cli": "codex",
        "claude-code": "claude-code",
        "coderabbit-cli": "coderabbit",
      },
      maxRunAgeMinutes: 60,
    });
  });

  it("rejects runtime-kind sources without an enabled agent attestation qualification", () => {
    const attestationEnforcement = {
      ...SELF_HOSTING_POLICY.attestationEnforcement,
      acceptedRuntimeKinds: {
        ...SELF_HOSTING_POLICY.attestationEnforcement.acceptedRuntimeKinds,
        "qualified-non-author-human": "human",
      },
    };

    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, attestationEnforcement })).toThrow();
  });

  it("rejects enabled agent attestation qualifications without a runtime kind", () => {
    const attestationEnforcement = {
      ...SELF_HOSTING_POLICY.attestationEnforcement,
      acceptedRuntimeKinds: {
        "claude-code": "claude-code",
        "coderabbit-cli": "coderabbit",
      },
    };

    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, attestationEnforcement }))
      .toThrow(/missing an accepted runtime kind: codex-cli/u);
  });

  it.each([0, -1, 1.5])("rejects max run age %s", (maxRunAgeMinutes) => {
    const attestationEnforcement = {
      ...SELF_HOSTING_POLICY.attestationEnforcement,
      maxRunAgeMinutes,
    };

    expect(() => parseSelfHostingPolicy({ ...SELF_HOSTING_POLICY, attestationEnforcement })).toThrow();
  });

  it("derives reviewer claims from enabled authenticated-attestation qualifications", () => {
    const parsed = parseSelfHostingPolicy({
      ...SELF_HOSTING_POLICY,
      qualifications: [
        ...SELF_HOSTING_POLICY.qualifications,
        {
          ...SELF_HOSTING_POLICY.qualifications[0],
          sourceIdentity: "enabled-durable-record",
          mode: "enabled",
          exactCoverage: true,
          durableResults: true,
          distinctOutcomes: true,
          durableFindings: true,
          closureCapability: true,
        },
        {
          ...SELF_HOSTING_POLICY.qualifications[1],
          sourceIdentity: "disabled-attestation",
          mode: "disabled",
        },
      ],
    });

    expect(deriveAcceptedReviewerClaims(parsed)).toEqual([
      "codex-cli",
      "claude-code",
      "coderabbit-cli",
      "qualified-non-author-human",
    ]);
  });

  it("returns the pinned App-bot user id", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));

    expect(parsed.providerIdentities.appBotUserId).toBe("302312524");
    expect(parsed.providerIdentities).toMatchObject({ codexAppId: "1144995", codexBotUserId: "199175422" });
  });

  it("pins one immutable fallback maintainer address", () => {
    const parsed = parseSelfHostingPolicy(JSON.parse(JSON.stringify(SELF_HOSTING_POLICY)));
    expect(parsed.fallbackMaintainer).toEqual({ login: "andrewRCr", expectedActorId: "44483269" });
    expect(() => parseSelfHostingPolicy({
      ...SELF_HOSTING_POLICY,
      fallbackMaintainer: { ...SELF_HOSTING_POLICY.fallbackMaintainer, expectedActorId: "andrew" },
    })).toThrow(/fallbackMaintainer/u);
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
    ["ownership policy", { ownershipPolicy: { ...SELF_HOSTING_POLICY.ownershipPolicy, id: "owner/v2" } }],
    ["review-risk policy", { reviewRiskPolicy: { ...SELF_HOSTING_POLICY.reviewRiskPolicy, id: "risk/v2" } }],
    ["ownership parameters", { ownershipPolicy: { ...SELF_HOSTING_POLICY.ownershipPolicy, artifactKinds: ["spec"] } }],
    ["semantics version", { semanticsVersion: "" }],
    ["minor gating", { minorGating: "advisory" }],
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
