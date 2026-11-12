import { describe, expect, expectTypeOf, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import {
  isManagedPath,
  type ManagedPath,
  validateManagedPath,
} from "../../../src/lib/kernel/canonical/managed-path.js";

describe("managed-path validation", () => {
  it.each([
    ["absolute POSIX", "/etc/passwd"],
    ["drive-letter absolute", "C:/Windows"],
    ["current-dir segment", "./a"],
    ["interior parent segment", "a/../b"],
    ["leading parent segment", "../escape"],
    ["backslash separator", "a\\b"],
    ["NUL byte", "a\0b"],
    ["empty", ""],
    ["double slash", "a//b"],
    ["trailing slash", "a/"],
  ])("rejects %s", (_label, path) => {
    expect(() => validateManagedPath(path)).toThrow();
    expect(isManagedPath(path)).toBe(false);
  });

  it("rejects a non-NFC path rather than silently normalizing it", () => {
    const nonNfc = "dir/é.md"; // "é" as e + combining acute accent
    expect(() => validateManagedPath(nonNfc)).toThrow(/NFC/u);
    expect(isManagedPath(nonNfc)).toBe(false);
  });

  it.each([
    ["lone high surrogate", "dir/\uD800.md"],
    ["lone low surrogate", "dir/\uDC00.md"],
  ])("rejects non-well-formed Unicode: %s", (_label, path) => {
    expect(() => validateManagedPath(path)).toThrow(/well-formed Unicode/u);
    expect(isManagedPath(path)).toBe(false);
  });

  it("returns a valid repository-relative POSIX path unchanged", () => {
    const path = ".arc/.internal/retirement-receipts/sha256-abc.json";
    const validated = validateManagedPath(path);
    expect(validated).toBe(path);
    expect(isManagedPath(path)).toBe(true);
    expectTypeOf(validated).toEqualTypeOf<ManagedPath>();
    expectTypeOf<string>().not.toExtend<ManagedPath>();

    const guarded: string = path;
    if (isManagedPath(guarded)) expectTypeOf(guarded).toEqualTypeOf<ManagedPath>();
  });

  it("rejects totally before hashing — a bad path never reaches a digest", () => {
    const digestOf = (candidate: string): string => canonicalDigest({ path: validateManagedPath(candidate) });

    expect(() => digestOf("../escape")).toThrow();
    expect(digestOf("dir/file.md")).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
