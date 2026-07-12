import { describe, expect, it } from "vitest";

import {
  deriveHostedProviderDeclaration,
  qualifyIndependentAnalysisSource,
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
