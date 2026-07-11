import { describe, expect, it } from "vitest";

import {
  canonicalizePlainJson,
  computeChangeSetId,
  computePolicyVersion,
} from "../../../../../src/scripts/review-gate/core/identity.js";

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
