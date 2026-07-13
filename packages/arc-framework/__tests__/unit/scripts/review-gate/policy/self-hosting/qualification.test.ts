import { describe, expect, it } from "vitest";

import {
  createHostedProviderProbePolicy,
  deriveHostedProviderDeclaration,
  qualifyIndependentAnalysisSource,
  selectReconcilePolicy,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/qualification.js";
import {
  parseSelfHostingPolicy,
  SELF_HOSTING_POLICY,
  type SourceQualificationDeclaration,
} from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const capable = {
  sourceKind: "agent",
  qualifier: "independent-analysis/v1",
  sourceIdentity: "agent-1",
  rubricVersion: "independent-analysis/v1",
  mode: "enabled",
  exactCoverage: true,
  durableResults: true,
  distinctOutcomes: true,
  durableFindings: true,
  closureCapability: true,
  transport: "authenticated-attestation",
  liveProbeRequired: false,
  parserVersion: null,
  providerAppId: null,
  providerBotUserId: null,
  guidanceDigest: null,
  terminalUnavailableMode: "disabled",
  requestActor: "explicit",
} satisfies SourceQualificationDeclaration;

describe("independent-analysis source qualification", () => {
  it("qualifies the enabled attested and durable-record source fixtures", () => {
    const identities = SELF_HOSTING_POLICY.qualifications
      .filter((source) => qualifyIndependentAnalysisSource(source, "independent-analysis/v1").qualified)
      .map((source) => source.sourceIdentity);

    expect(identities).toEqual([
      "codex-cli",
      "claude-code",
      "coderabbit-cli",
      "qualified-non-author-human",
    ]);
  });

  it.each([
    ["rubric delivery", { rubricVersion: "other/v1" }],
    ["coverage bounds", { exactCoverage: false }],
    ["durable result", { durableResults: false }],
    ["result distinction", { distinctOutcomes: false }],
    ["durable findings", { durableFindings: false }],
    ["closure", { closureCapability: false }],
    ["disabled", { mode: "disabled" as const }],
  ])("rejects missing %s", (_name, override) => {
    expect(qualifyIndependentAnalysisSource({ ...capable, ...override }, "independent-analysis/v1").qualified).toBe(false);
  });

  it("keeps the pull-request provider declaration disabled during shadow observation", () => {
    const source = SELF_HOSTING_POLICY.qualifications.find((candidate) => candidate.sourceIdentity === "coderabbit-pr");
    expect(source).toBeDefined();
    expect(source?.mode).toBe("partial");
    expect(qualifyIndependentAnalysisSource(source!, "independent-analysis/v1").qualified).toBe(false);
  });

  it("derives enabled versus partial hosted declarations only from baseline outcomes", () => {
    const baseline = {
      sourceIdentity: "codex-pr" as const,
      parserVersion: "codex-evidence/v1",
      providerAppId: "1144995",
      providerBotUserId: "199175422",
      guidanceDigest: "a".repeat(64),
      requestActor: "pr-author" as const,
      requestQualified: true,
      artifactParserQualified: true,
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      terminalUnavailableMode: "parser-only" as const,
      observedLive: true,
    };
    expect(deriveHostedProviderDeclaration(baseline)).toMatchObject({ mode: "enabled", sourceIdentity: "codex-pr" });
    expect(deriveHostedProviderDeclaration({ ...baseline, observedLive: false })).toMatchObject({ mode: "partial" });
  });

  it("builds a schema-valid single-provider probe hypothesis without mutating baseline policy", () => {
    const guidanceDigest = "a".repeat(64);
    const probe = createHostedProviderProbePolicy(SELF_HOSTING_POLICY, "codex", guidanceDigest);
    const codex = probe.qualifications.find((candidate) => candidate.sourceIdentity === "codex-pr");
    const coderabbit = probe.qualifications.find((candidate) => candidate.sourceIdentity === "coderabbit-pr");
    expect(codex).toMatchObject({
      mode: "enabled",
      exactCoverage: true,
      durableResults: true,
      distinctOutcomes: true,
      durableFindings: true,
      closureCapability: true,
      guidanceDigest,
    });
    expect(coderabbit?.mode).toBe("partial");
    expect(SELF_HOSTING_POLICY.qualifications.find((candidate) => candidate.sourceIdentity === "codex-pr")?.mode)
      .toBe("partial");
    expect(() => createHostedProviderProbePolicy(SELF_HOSTING_POLICY, "codex", "not-a-digest"))
      .toThrow(/guidance-invalid/u);
  });

  it("allows probe hypotheses only on the explicit protected workflow-dispatch mode", () => {
    const input = {
      eventName: "workflow_dispatch",
      qualificationMode: "live-provider-probe",
      qualificationProvider: "codex",
      qualificationGuidanceDigest: "a".repeat(64),
    };
    expect(selectReconcilePolicy(SELF_HOSTING_POLICY, input).qualifications
      .find((candidate) => candidate.sourceIdentity === "codex-pr")?.mode).toBe("enabled");
    expect(selectReconcilePolicy(SELF_HOSTING_POLICY, { eventName: "schedule" })).toBe(SELF_HOSTING_POLICY);
    expect(() => selectReconcilePolicy(SELF_HOSTING_POLICY, { ...input, eventName: "schedule" }))
      .toThrow(/policy-refused/u);
    expect(() => selectReconcilePolicy(SELF_HOSTING_POLICY, { ...input, qualificationMode: "" }))
      .toThrow(/policy-refused/u);
    expect(() => selectReconcilePolicy(SELF_HOSTING_POLICY, {
      ...input,
      qualificationProvider: "coderabbit",
    })).toThrow(/policy-refused/u);
  });

  it("rejects local transcripts, generic approvals, runtime labels, capacity, and secrets as policy declarations", () => {
    for (const extra of [
      { transport: "local-transcript" },
      { qualifier: "approved" },
      { runtimeLabel: "enabled" },
      { capacity: "available" },
      { secret: "token" },
    ]) {
      expect(() => parseSelfHostingPolicy({
        ...SELF_HOSTING_POLICY,
        qualifications: [{ ...capable, ...extra }],
      })).toThrow();
    }
  });
});
