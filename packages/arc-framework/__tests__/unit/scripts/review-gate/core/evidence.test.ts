import { describe, expect, it } from "vitest";

import { parseEvidence } from "../../../../../src/scripts/review-gate/core/evidence.js";

const evidence = {
  schemaVersion: 1,
  requirementId: "independent-analysis",
  sourceKind: "agent",
  sourceIdentity: "agent-9",
  result: "findings",
  evidenceUrlOrId: "evidence:run-2",
  reviewRunId: "run-2",
  reviewerClaim: "fresh independent pass",
  submitterIdentity: "actor-4",
  policyVersion: "a".repeat(64),
  rubricVersion: "independent-analysis/v1",
  coverage: "full",
  coverageFromSha: "b".repeat(40),
  coverageThroughSha: "c".repeat(40),
  baseRef: "main",
  diffBaseSha: "b".repeat(40),
  changeSetId: "d".repeat(64),
  headSha: "c".repeat(40),
  findings: [{
    findingId: "finding-1",
    severity: "high",
    locus: "src/controller.ts:44",
    evidenceUrlOrId: "evidence:finding-1",
  }],
  closures: [{
    findingId: "finding-0",
    authorityKind: "source-confirmed",
    authorityIdentity: "agent-9",
    evidenceUrlOrId: "evidence:closure-1",
  }],
  observedAt: "2026-07-10T20:00:00.000Z",
};

describe("normalized evidence", () => {
  it("round-trips coverage, findings, and closure authority", () => {
    expect(parseEvidence(JSON.parse(JSON.stringify(evidence)))).toEqual(evidence);
  });

  it("round-trips an optional source-authenticated recurrence relation", () => {
    const recurring = {
      ...evidence,
      findings: [{ ...evidence.findings[0], recursFindingId: "finding-0" }],
    };
    expect(parseEvidence(recurring).findings[0]?.recursFindingId).toBe("finding-0");
  });

  it.each([
    ["coverage", { ...evidence, coverage: "partial" }],
    ["coverage bounds", { ...evidence, coverageThroughSha: "unsafe" }],
    ["closure authority", {
      ...evidence,
      closures: [{ ...evidence.closures[0], authorityKind: "thread-resolved" }],
    }],
    ["unsafe evidence reference", { ...evidence, evidenceUrlOrId: "javascript:alert(1)" }],
    ["space-prefixed unsafe reference", { ...evidence, evidenceUrlOrId: " javascript:alert(1)" }],
    ["finding result without findings", { ...evidence, findings: [] }],
    ["clean result with findings", { ...evidence, result: "clean" }],
  ])("rejects malformed %s", (_name, input) => {
    expect(() => parseEvidence(input)).toThrow();
  });

  it("rejects source-scoped finding identity reuse in one record", () => {
    expect(() => parseEvidence({
      ...evidence,
      findings: [evidence.findings[0], { ...evidence.findings[0], locus: "src/other.ts:7" }],
    })).toThrow(/findingId/u);
  });
});
