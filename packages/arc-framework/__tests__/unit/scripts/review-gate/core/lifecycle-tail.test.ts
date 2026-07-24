import { describe, expect, it } from "vitest";

import {
  createForwardLifecycleTailProof,
  ForwardLifecycleTailProofSchema,
  isApplicableLifecycleTail,
  isApplicableForwardLifecycleTail,
  type LifecycleTailProof,
} from "../../../../../src/scripts/review-gate/core/lifecycle-tail.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";

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
    rubricVersion: "standard-review/v1",
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
  rubricVersion: "standard-review/v1",
  sourceIdentity: "agent-1",
};

describe("lifecycle-tail proof applicability", () => {
  it("accepts an exact diagnostic-free storage-neutral proof", () => {
    expect(isApplicableLifecycleTail({ proof: proof(), ...expected })).toBe(true);
  });

  it.each([
    ["schema version", { ...proof(), schemaVersion: 2 }],
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

describe("forward lifecycle-tail applicability", () => {
  it("carries review coverage only when exact surface identities agree", () => {
    const priorTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: BASE,
      diffBaseTree: "d".repeat(40),
      headSha: REVIEWED,
      headTree: "e".repeat(40),
    });
    const currentTarget = createReviewTarget({
      schemaVersion: priorTarget.schemaVersion,
      semanticsVersion: priorTarget.semanticsVersion,
      kind: priorTarget.kind,
      repositoryId: priorTarget.repositoryId,
      baseRef: priorTarget.baseRef,
      diffBaseSha: priorTarget.diffBaseSha,
      diffBaseTree: priorTarget.diffBaseTree,
      headSha: HEAD,
      headTree: "f".repeat(40),
    });
    const surface = {
      treeId: "1".repeat(40),
      pathManifestDigest: `sha256:${"2".repeat(64)}` as const,
      semanticDigest: `sha256:${"3".repeat(64)}` as const,
    };
    const proof = createForwardLifecycleTailProof({
      predicateId: "lifecycle-bookkeeping-tail/v2",
      priorTarget,
      currentTarget,
      reviewedSurface: surface,
      currentSurface: { ...surface },
      policyVersion: `sha256:${"4".repeat(64)}`,
      rubricVersion: "standard-review/v1",
      rubricDigest: `sha256:${"5".repeat(64)}`,
      sourceIdentity: "agent-1",
      artifact: { workUnitId: "review-gate", artifactGroupId: "review-gate", cohortPath: null },
      diagnostics: [],
    });

    expect(isApplicableForwardLifecycleTail({
      proof,
      priorTarget,
      currentTarget,
      policyVersion: proof.policyVersion,
      rubricVersion: proof.rubricVersion,
      rubricDigest: proof.rubricDigest,
      sourceIdentity: proof.sourceIdentity,
    })).toBe(true);
    expect(proof.applicability).toEqual({ treatment: "carry", scope: "review-coverage-only" });
    expect(() => ForwardLifecycleTailProofSchema.parse({
      ...proof,
      mergeAuthority: true,
    })).toThrow(/unrecognized key/iu);
  });
});
