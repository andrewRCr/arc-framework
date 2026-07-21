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
    expect(identity).toBe("b6b08cdc346a8bea4ce30d3d9420168c8db4a3766d2d88e74c2cc02e40acd6f5");
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

  it("adopts kernel Unicode ordering and normalization", () => {
    expect(canonicalizePlainJson({ z: 1, ä: 2 })).toBe('{"z":1,"ä":2}');
    expect(canonicalizePlainJson({ value: "e\u0301" })).toBe('{"value":"é"}');
    expect(canonicalizePlainJson({ "e\u0301": 1 })).toBe('{"é":1}');
    expect(() => canonicalizePlainJson({ é: 1, "e\u0301": 2 })).toThrow(/collide/u);
  });

  it("rejects malformed Unicode and sparse arrays", () => {
    const sparse = ["first", "second"];
    delete sparse[0];

    expect(() => canonicalizePlainJson("\ud800")).toThrow(/well-formed Unicode/u);
    expect(() => canonicalizePlainJson(sparse)).toThrow(/sparse arrays/u);
  });

  it("changes policy identity for data, predicate, or semantics changes", () => {
    const baseline = { semanticsVersion: "v1", predicateId: "risk/v1", threshold: 2 };
    const identity = computePolicyVersion({ policy: baseline });

    expect(computePolicyVersion({ policy: { ...baseline, threshold: 3 } })).not.toBe(identity);
    expect(computePolicyVersion({ policy: { ...baseline, predicateId: "risk/v2" } })).not.toBe(identity);
    expect(computePolicyVersion({ policy: { ...baseline, semanticsVersion: "v2" } })).not.toBe(identity);
  });

  it("pins kernel-backed policy divergence without changing ASCII output", () => {
    expect(computePolicyVersion({ policy: { b: 2, a: 1 } })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(computePolicyVersion({ policy: { z: 1, ä: 2 } })).toBe(
      "7832a5d6150a56da1a4f0c8fa00c26a7350389b0fc8696707cd2abbbd32be0c1",
    );
    expect(computePolicyVersion({ policy: { value: "e\u0301" } })).toBe(
      "69e46f3f0688000ab7eeb9e40e6a516a254268cd644a24f4f69cf7ad063cf479",
    );
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
