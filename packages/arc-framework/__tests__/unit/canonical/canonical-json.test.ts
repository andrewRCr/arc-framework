import { describe, expect, it } from "vitest";

import {
  assertCanonicalDigest,
  canonicalDigest,
  canonicalize,
  isCanonicalDigest,
  sortByCanonicalBytes,
} from "../../../src/lib/canonical/canonical-json.js";

describe("canonical JSON serialization", () => {
  it("serializes object keys in recursively codepoint order regardless of insertion order", () => {
    expect(canonicalize({ z: 1, nested: { y: true, b: "x" }, list: [2, 1] })).toBe(
      '{"list":[2,1],"nested":{"b":"x","y":true},"z":1}',
    );
  });

  it("orders keys by Unicode codepoint, not locale (uppercase and punctuation before lowercase)", () => {
    // localeCompare (en) would yield ["a","b","Z","_x"]; codepoint order is Z(90) < _(95) < a(97) < b(98).
    expect(canonicalize({ b: 1, a: 2, Z: 3, _x: 4 })).toBe('{"Z":3,"_x":4,"a":2,"b":1}');
  });

  it("NFC-normalizes strings so differently-composed equal strings serialize and hash identically", () => {
    const composed = "é"; // é as a single codepoint
    const decomposed = "é"; // e + combining acute accent

    expect(canonicalize({ k: decomposed })).toBe(`{"k":"${composed}"}`);
    expect(canonicalDigest({ k: decomposed })).toBe(canonicalDigest({ k: composed }));
    expect(canonicalDigest({ [decomposed]: 1 })).toBe(canonicalDigest({ [composed]: 1 }));
  });

  it("emits no insignificant whitespace and no trailing newline", () => {
    const out = canonicalize({ a: 1, b: [1, 2], c: { d: "e" } });

    expect(out).toBe('{"a":1,"b":[1,2],"c":{"d":"e"}}');
    expect(out).not.toMatch(/\s/u);
  });

  it("preserves array order (arrays are semantically ordered, never sorted)", () => {
    expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["nested non-finite", { n: Number.NaN }],
    ["undefined", undefined],
    ["bigint", BigInt(1)],
    ["function", () => true],
    ["Date", new Date("2026-07-15T00:00:00.000Z")],
    ["Map", new Map([["a", 1]])],
    ["RegExp", /pattern/u],
  ])("rejects non-plain-data value: %s", (_label, value) => {
    expect(() => canonicalize(value)).toThrow();
  });

  it("rejects symbol keys rather than silently dropping them", () => {
    expect(() => canonicalize({ [Symbol("s")]: 1 })).toThrow();
  });

  it("rejects cyclic references", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow();
  });

  it("rejects object keys that collide under NFC normalization", () => {
    expect(() => canonicalize({ ["é"]: 1, ["é"]: 2 })).toThrow(/collide under NFC/u);
  });
});

describe("CanonicalDigest validation", () => {
  const valid = `sha256:${"a".repeat(64)}`;

  it("accepts exactly sha256: plus 64 lowercase hex", () => {
    expect(isCanonicalDigest(valid)).toBe(true);
    expect(canonicalDigest({})).toSatisfy(isCanonicalDigest);
  });

  it.each([
    ["uppercase hex", `sha256:${"A".repeat(64)}`],
    ["too short", `sha256:${"a".repeat(63)}`],
    ["too long", `sha256:${"a".repeat(65)}`],
    ["missing prefix", "a".repeat(64)],
    ["wrong algorithm", `sha1:${"a".repeat(64)}`],
    ["empty", ""],
    ["non-string", 123],
  ])("rejects every other spelling: %s", (_label, value) => {
    expect(isCanonicalDigest(value)).toBe(false);
    expect(() => assertCanonicalDigest(value)).toThrow();
  });
});

describe("set-valued array ordering", () => {
  it("orders scalar members by canonical bytes", () => {
    expect(sortByCanonicalBytes(["b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("orders structured members by canonical bytes", () => {
    expect(sortByCanonicalBytes([{ p: 2 }, { p: 1 }])).toEqual([{ p: 1 }, { p: 2 }]);
  });

  it("is order-insensitive: any input permutation yields the same set ordering", () => {
    const forward = sortByCanonicalBytes(["a", "b", "c"]);
    const reversed = sortByCanonicalBytes(["c", "b", "a"]);
    expect(reversed).toEqual(forward);
  });
});

describe("cross-platform golden vector", () => {
  it("hashes a fixed input to a fixed digest, independent of OS or checkout line endings", () => {
    const digest = canonicalDigest({
      schemaVersion: 1,
      subject: "husk-lifecycle-drivers",
      nested: { b: 2, a: 1 },
      list: [1, 2, 3],
      text: "é",
      lines: "first\nsecond",
    });

    expect(digest).toBe("sha256:3d298f586bc3245459b19f70f8d823e23e9311bcc32941f3042582fdc53e51a0");
  });
});
