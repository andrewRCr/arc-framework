import { describe, expect, it } from "vitest";

import type { ReviewRequirement } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type { Evidence } from "../../../../../src/scripts/review-gate/core/evidence.js";
import { reduceCoverage } from "../../../../../src/scripts/review-gate/core/coverage.js";

const sha = (value: string): string => value.repeat(40);

function requirement(): ReviewRequirement {
  return {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: "b".repeat(64),
    headSha: sha("f"),
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  const req = requirement();
  return {
    schemaVersion: 1,
    requirementId: req.id,
    sourceKind: "agent",
    sourceIdentity: "agent-1",
    result: "clean",
    evidenceUrlOrId: "evidence:1",
    policyVersion: req.policyVersion,
    rubricVersion: req.rubricVersion,
    coverage: "full",
    coverageFromSha: sha("0"),
    coverageThroughSha: req.headSha,
    baseRef: "main",
    diffBaseSha: sha("0"),
    changeSetId: req.changeSetId,
    headSha: req.headSha,
    findings: [],
    closures: [],
    observedAt: "2026-07-10T20:00:00.000Z",
    ...overrides,
  };
}

const input = {
  requirement: requirement(),
  baseRef: "main",
  diffBaseSha: sha("0"),
  headSha: sha("f"),
};

describe("evidence coverage reduction", () => {
  it("accepts one full current review", () => {
    expect(reduceCoverage({ ...input, evidence: [evidence()] })).toMatchObject({ satisfied: true });
  });

  it("accepts a contiguous full-plus-incremental chain ending clean", () => {
    const middle = sha("7");
    const chain = [
      evidence({ result: "findings", coverageThroughSha: middle, findings: [{
        findingId: "f-1",
        severity: "medium",
        locus: "src/a.ts:1",
        evidenceUrlOrId: "finding:1",
      }] }),
      evidence({ coverage: "incremental", coverageFromSha: middle, coverageThroughSha: sha("f") }),
    ];
    expect(reduceCoverage({ ...input, evidence: chain })).toMatchObject({ satisfied: true, chain });
  });

  it.each([
    ["gap", [
      evidence({ coverageThroughSha: sha("6") }),
      evidence({ coverage: "incremental", coverageFromSha: sha("7") }),
    ]],
    ["overlap", [
      evidence({ coverageThroughSha: sha("8") }),
      evidence({ coverage: "incremental", coverageFromSha: sha("7") }),
    ]],
    ["cross-source", [
      evidence({ coverageThroughSha: sha("7") }),
      evidence({ coverage: "incremental", coverageFromSha: sha("7"), sourceIdentity: "agent-2" }),
    ]],
    ["retarget", [evidence({ baseRef: "release" })]],
    ["merge-base", [evidence({ diffBaseSha: sha("1"), coverageFromSha: sha("1") })]],
    ["stale terminal", [evidence({ coverageThroughSha: sha("e") })]],
    ["failed link", [evidence({ result: "failed" })]],
  ])("rejects a %s chain", (_name, chain) => {
    expect(reduceCoverage({ ...input, evidence: chain })).toMatchObject({ satisfied: false });
  });
});
