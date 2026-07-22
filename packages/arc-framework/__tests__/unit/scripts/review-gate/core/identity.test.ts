import { describe, expect, it } from "vitest";

import {
  canonicalizePlainJson,
  computeChangeSetId,
  computePolicyVersion,
  computeReviewPolicyVersion,
} from "../../../../../src/scripts/review-gate/core/identity.js";
import {
  INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY,
} from "../../../../../src/scripts/review-gate/policy/independent-analysis.js";

const diffBaseSha = "a".repeat(40);
const headSha = "b".repeat(40);

describe("canonical review identities", () => {
  it("binds change identity to base ref, diff base, and head only", () => {
    const identity = computeChangeSetId({ baseRef: "main", diffBaseSha, headSha });

    expect(identity).toHaveLength(64);
    expect(computeChangeSetId({ baseRef: "release", diffBaseSha, headSha })).not.toBe(identity);
    expect(computeChangeSetId({ baseRef: "main", diffBaseSha: "c".repeat(40), headSha })).not.toBe(identity);
    expect(computeChangeSetId({ baseRef: "main", diffBaseSha, headSha: "d".repeat(40) })).not.toBe(identity);
  });

  it("sorts object keys recursively while preserving array order", () => {
    expect(canonicalizePlainJson({ z: 1, nested: { b: true, a: "x" }, list: [2, 1] })).toBe(
      '{"list":[2,1],"nested":{"a":"x","b":true},"z":1}',
    );
    expect(computePolicyVersion({ policy: { b: 2, a: 1 } })).toBe(
      computePolicyVersion({ policy: { a: 1, b: 2 } }),
    );
    expect(computePolicyVersion({ policy: { list: [1, 2] } })).not.toBe(
      computePolicyVersion({ policy: { list: [2, 1] } }),
    );
  });

  it("changes policy identity for data, predicate, or semantics changes", () => {
    const baseline = { semanticsVersion: "v1", predicateId: "risk/v1", threshold: 2 };
    const identity = computePolicyVersion({ policy: baseline });

    expect(computePolicyVersion({ policy: { ...baseline, threshold: 3 } })).not.toBe(identity);
    expect(computePolicyVersion({ policy: { ...baseline, predicateId: "risk/v2" } })).not.toBe(identity);
    expect(computePolicyVersion({ policy: { ...baseline, semanticsVersion: "v2" } })).not.toBe(identity);
  });

  it("excludes runtime rollout and observed capacity from policy identity", () => {
    const policy = { semanticsVersion: "v1", predicateId: "risk/v1" };

    expect(computePolicyVersion({ policy, runtime: { rolloutMode: "shadow", capacity: "available" } })).toBe(
      computePolicyVersion({ policy, runtime: { rolloutMode: "final", capacity: "exhausted" } }),
    );
  });

  it("normalizes accepted sources into one domain-separated forward policy identity", () => {
    const input = {
      schemaVersion: 2 as const,
      semanticsVersion: "review-gate/v2" as const,
      kind: "independent-analysis" as const,
      obligation: "required" as const,
      rubricVersion: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.version,
      rubricDigest: INDEPENDENT_ANALYSIS_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const,
      count: 1 as const,
      acceptableSources: [
        { sourceKind: "human", qualifier: null },
        { sourceKind: "agent", qualifier: "carrier/v1" },
      ],
      initialAdmission: "automatic" as const,
    };
    const identity = computeReviewPolicyVersion(input);

    expect(identity).toBe("sha256:110eacb3ae6ccf7f8592be089a07f18dec1af13423fe3d3d118c751a9ea9e902");
    expect(computeReviewPolicyVersion({
      ...input,
      acceptableSources: [
        ...input.acceptableSources.slice().reverse(),
        input.acceptableSources[0]!,
      ],
    })).toBe(identity);
    expect(computePolicyVersion({ policy: input })).not.toBe(identity);
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { value: undefined },
    { value: () => true },
    { value: BigInt(1) },
    new Date("2026-07-10T00:00:00.000Z"),
  ])("rejects unsupported policy values", (value) => {
    expect(() => canonicalizePlainJson(value)).toThrow();
  });

  it("rejects ambiguous change identity inputs", () => {
    expect(() => computeChangeSetId({ baseRef: "main\0other", diffBaseSha, headSha })).toThrow();
    expect(() => computeChangeSetId({ baseRef: "", diffBaseSha, headSha })).toThrow();
    expect(() => computeChangeSetId({ baseRef: "main", diffBaseSha: "short", headSha })).toThrow();
  });
});
