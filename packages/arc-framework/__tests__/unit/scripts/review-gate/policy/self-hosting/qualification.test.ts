import { describe, expect, it } from "vitest";

import { qualifyIndependentAnalysisSource } from "../../../../../../src/scripts/review-gate/policy/self-hosting/qualification.js";
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
  enabled: true,
  exactCoverage: true,
  durableResults: true,
  distinctOutcomes: true,
  durableFindings: true,
  closureCapability: true,
  transport: "authenticated-attestation",
  liveProbeRequired: false,
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
    ["disabled", { enabled: false }],
  ])("rejects missing %s", (_name, override) => {
    expect(qualifyIndependentAnalysisSource({ ...capable, ...override }, "independent-analysis/v1").qualified).toBe(false);
  });

  it("keeps the pull-request provider declaration disabled during shadow observation", () => {
    const source = SELF_HOSTING_POLICY.qualifications.find((candidate) => candidate.sourceIdentity === "coderabbit-pr");
    expect(source).toBeDefined();
    expect(source?.enabled).toBe(false);
    expect(qualifyIndependentAnalysisSource(source!, "independent-analysis/v1").qualified).toBe(false);
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
