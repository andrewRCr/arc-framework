import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { isManagedPath, validateManagedPath } from "../../../src/lib/canonical/managed-path.js";

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

  it("returns a valid repository-relative POSIX path unchanged", () => {
    const path = ".arc/.internal/retirement-receipts/sha256-abc.json";
    expect(validateManagedPath(path)).toBe(path);
    expect(isManagedPath(path)).toBe(true);
  });

  it("rejects totally before hashing — a bad path never reaches a digest", () => {
    const digestOf = (candidate: string): string => canonicalDigest({ path: validateManagedPath(candidate) });

    expect(() => digestOf("../escape")).toThrow();
    expect(digestOf("dir/file.md")).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
