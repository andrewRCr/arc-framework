import { describe, expect, it } from "vitest";

import type { Evidence, FindingClosure } from "../../../../../src/scripts/review-gate/core/evidence.js";
import { reduceFindings } from "../../../../../src/scripts/review-gate/core/findings.js";

const CHANGE = "a".repeat(64);

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    schemaVersion: 1,
    requirementId: "analysis",
    sourceKind: "agent",
    sourceIdentity: "agent-1",
    result: "findings",
    evidenceUrlOrId: "evidence:1",
    policyVersion: "b".repeat(64),
    rubricVersion: "independent-analysis/v1",
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: "d".repeat(40),
    baseRef: "main",
    diffBaseSha: "c".repeat(40),
    changeSetId: CHANGE,
    headSha: "d".repeat(40),
    findings: [{ findingId: "f-1", severity: "high", locus: "src/a.ts:1", evidenceUrlOrId: "finding:1" }],
    closures: [],
    observedAt: "2026-07-10T20:00:00.000Z",
    ...overrides,
  };
}

describe("finding history and closure", () => {
  it("keeps earlier findings open despite a later aggregate clean result", () => {
    const result = reduceFindings({
      evidence: [evidence(), evidence({ result: "clean", findings: [], evidenceUrlOrId: "evidence:2" })],
      currentChangeSetId: CHANGE,
      authorizedDismissers: [],
      knownHostActors: [],
    });
    expect(result.openFindings).toHaveLength(1);
    expect(result.consistent).toBe(true);
  });

  it("rejects reuse of a source-scoped id for different finding content", () => {
    const result = reduceFindings({
      evidence: [evidence(), evidence({ findings: [{
        findingId: "f-1",
        severity: "low",
        locus: "src/other.ts:2",
        evidenceUrlOrId: "finding:2",
      }] })],
      currentChangeSetId: CHANGE,
      authorizedDismissers: [],
      knownHostActors: [],
    });
    expect(result.consistent).toBe(false);
  });

  it("accepts same-source confirmation and authenticated dismissal for named findings only", () => {
    const sourceClosed = evidence({
      result: "clean",
      findings: [],
      closures: [{
        findingId: "f-1",
        authorityKind: "source-confirmed",
        authorityIdentity: "agent-1",
        evidenceUrlOrId: "closure:1",
      }],
    });
    expect(reduceFindings({
      evidence: [evidence(), sourceClosed],
      currentChangeSetId: CHANGE,
      authorizedDismissers: [],
      knownHostActors: [],
    }).openFindings).toEqual([]);

    const dismissed = evidence({
      result: "clean",
      findings: [],
      closures: [{
        findingId: "f-1",
        authorityKind: "authorized-dismissal",
        authorityIdentity: "maintainer-1",
        evidenceUrlOrId: "receipt:dismiss-1",
      }],
    });
    expect(reduceFindings({
      evidence: [evidence(), dismissed],
      currentChangeSetId: CHANGE,
      authorizedDismissers: ["maintainer-1"],
      knownHostActors: [],
    }).openFindings).toEqual([]);
  });

  const invalidClosures: Array<[string, FindingClosure]> = [
    ["wrong source", {
      findingId: "f-1", authorityKind: "source-confirmed", authorityIdentity: "agent-2", evidenceUrlOrId: "closure:1",
    }],
    ["wrong actor", {
      findingId: "f-1", authorityKind: "authorized-dismissal", authorityIdentity: "reader-1", evidenceUrlOrId: "closure:1",
    }],
    ["unknown finding", {
      findingId: "missing", authorityKind: "source-confirmed", authorityIdentity: "agent-1", evidenceUrlOrId: "closure:1",
    }],
  ];

  it.each(invalidClosures)("rejects %s closure authority", (_name, closure) => {
    const result = reduceFindings({
      evidence: [evidence(), evidence({ result: "clean", findings: [], closures: [closure] })],
      currentChangeSetId: CHANGE,
      authorizedDismissers: [],
      knownHostActors: [],
    });
    expect(result.consistent).toBe(false);
  });

  it("does not let alternate-source clean evidence erase original findings", () => {
    const result = reduceFindings({
      evidence: [evidence(), evidence({ result: "clean", findings: [], sourceIdentity: "agent-2" })],
      currentChangeSetId: CHANGE,
      authorizedDismissers: [],
      knownHostActors: [],
    });
    expect(result.openFindings.map((finding) => finding.sourceIdentity)).toEqual(["agent-1"]);
  });
});
