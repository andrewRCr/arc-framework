/** Frozen byte and refusal contract for durable review-gate version-1 identities. */

import { describe, expect, it } from "vitest";

import { canonicalizeReviewGateV1 } from "../../../../../src/scripts/review-gate/core/legacy-canonical-v1.js";

describe("legacy review-gate version-1 canonicalization", () => {
  it("preserves recursive ASCII bytes and ambient locale ordering", () => {
    expect(canonicalizeReviewGateV1({ z: 1, nested: { b: true, a: "x" }, list: [2, 1] })).toBe(
      '{"list":[2,1],"nested":{"a":"x","b":true},"z":1}',
    );
    expect(canonicalizeReviewGateV1({ z: 1, ä: 2 })).toBe('{"ä":2,"z":1}');
  });

  it("preserves non-normalized strings and JSON numeric-key ordering", () => {
    expect(canonicalizeReviewGateV1({ value: "é" })).toBe('{"value":"é"}');
    expect(canonicalizeReviewGateV1({ value: "e\u0301" })).toBe('{"value":"é"}');
    expect(canonicalizeReviewGateV1({ 10: "ten", 2: "two" })).toBe('{"2":"two","10":"ten"}');
  });

  it("preserves legacy JSON edge behavior", () => {
    const sparse = ["first", "second"];
    delete sparse[0];
    const ownProto = JSON.parse('{"__proto__":"retained by source"}') as unknown;

    expect(canonicalizeReviewGateV1("\ud800")).toBe('"\\ud800"');
    expect(canonicalizeReviewGateV1(sparse)).toBe('[null,"second"]');
    expect(canonicalizeReviewGateV1(ownProto)).toBe("{}");
  });

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    { value: undefined },
    { value: () => true },
    { value: BigInt(1) },
    new Date("2026-07-10T00:00:00.000Z"),
  ])("rejects unsupported values", (value) => {
    expect(() => canonicalizeReviewGateV1(value)).toThrow();
  });

  it("rejects cycles and symbol keys", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const symbolKeyed = { [Symbol("key")]: "value" };

    expect(() => canonicalizeReviewGateV1(cyclic)).toThrow();
    expect(() => canonicalizeReviewGateV1(symbolKeyed)).toThrow();
  });
});
