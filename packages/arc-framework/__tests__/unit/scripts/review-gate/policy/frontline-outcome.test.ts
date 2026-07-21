import { describe, expect, it } from "vitest";

import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";

const target = {
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
  targetId: `sha256:${"e".repeat(64)}`,
} as const;

const source = {
  sourceId: "review-cli",
  kind: "command",
  executable: "reviewer",
  argv: ["--plain"],
} as const;

describe("frontline outcome normalization", () => {
  it("binds clean completion to the exact source, target, and pass", () => {
    expect(normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target,
      pass: 1,
      maxPasses: 2,
    })).toEqual({
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      outcome: "clean",
      source,
      target,
      pass: 1,
      maxPasses: 2,
      findings: [],
      reason: null,
    });
  });

  it("preserves explicit normalized findings as a non-clean completion", () => {
    const findings = [{
      findingId: "finding-1",
      severity: "major",
      locus: "src/review.ts:42",
      evidenceUrlOrId: "provider:item-1",
    }] as const;

    expect(normalizeFrontlineOutcome({
      providerResult: { kind: "findings", findings },
      source,
      target,
      pass: 1,
      maxPasses: 2,
    })).toMatchObject({
      outcome: "findings",
      findings,
      reason: null,
      source,
      target,
      pass: 1,
    });
  });

  it.each([
    ["rate-limited", "unavailable"],
    ["unavailable", "unavailable"],
    ["ambiguous", "failed"],
    ["partial", "failed"],
    ["malformed", "failed"],
    ["stale-head", "failed"],
    ["failed", "failed"],
    ["pass-cap-exhausted", "pass-cap-exhausted"],
  ] as const)("maps provider %s to non-clean %s", (kind, outcome) => {
    expect(normalizeFrontlineOutcome({
      providerResult: kind === "unavailable"
        ? { kind, reason: "provider-offline" }
        : kind === "failed"
          ? { kind, reason: "provider-failed" }
          : { kind },
      source,
      target,
      pass: 2,
      maxPasses: 2,
    })).toMatchObject({
      outcome,
      source,
      target,
      pass: 2,
      maxPasses: 2,
      findings: [],
      reason: expect.any(String),
    });
  });

  it("rejects a pass beyond the resolved allowance", () => {
    expect(() => normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target,
      pass: 2,
      maxPasses: 1,
    })).toThrow(/pass cannot exceed/iu);
  });
});
