import { describe, expect, it } from "vitest";

import {
  isApplicableLifecycleTail,
  type LifecycleTailProof,
} from "../../../../../src/scripts/review-gate/core/lifecycle-tail.js";

const BASE = "a".repeat(40);
const REVIEWED = "b".repeat(40);
const HEAD = "c".repeat(40);

function proof(overrides: Partial<LifecycleTailProof> = {}): LifecycleTailProof {
  return {
    schemaVersion: 1,
    predicateId: "lifecycle-bookkeeping-tail/v1",
    reviewedThroughSha: REVIEWED,
    currentHeadSha: HEAD,
    baseRef: "main",
    diffBaseSha: BASE,
    policyVersion: "d".repeat(64),
    rubricVersion: "independent-analysis/v1",
    sourceIdentity: "agent-1",
    artifact: {
      workUnitId: "review-gate",
      artifactGroupId: "review-gate",
      cohortPath: null,
    },
    diagnostics: [],
    ...overrides,
  };
}

const expected = {
  predicateId: "lifecycle-bookkeeping-tail/v1",
  reviewedThroughSha: REVIEWED,
  currentHeadSha: HEAD,
  baseRef: "main",
  diffBaseSha: BASE,
  policyVersion: "d".repeat(64),
  rubricVersion: "independent-analysis/v1",
  sourceIdentity: "agent-1",
};

describe("lifecycle-tail proof applicability", () => {
  it("accepts an exact diagnostic-free storage-neutral proof", () => {
    expect(isApplicableLifecycleTail({ proof: proof(), ...expected })).toBe(true);
  });

  it.each([
    ["diagnostic", proof({ diagnostics: ["ambiguous-artifact-group"] })],
    ["predicate", proof({ predicateId: "other" })],
    ["reviewed head", proof({ reviewedThroughSha: "e".repeat(40) })],
    ["current head", proof({ currentHeadSha: "e".repeat(40) })],
    ["base", proof({ baseRef: "release" })],
    ["diff base", proof({ diffBaseSha: "e".repeat(40) })],
    ["policy", proof({ policyVersion: "e".repeat(64) })],
    ["rubric", proof({ rubricVersion: "other/v1" })],
    ["source", proof({ sourceIdentity: "agent-2" })],
    ["artifact identity", proof({ artifact: { workUnitId: "", artifactGroupId: "", cohortPath: null } })],
  ])("rejects a proof with %s drift", (_name, candidate) => {
    expect(isApplicableLifecycleTail({ proof: candidate, ...expected })).toBe(false);
  });
});
