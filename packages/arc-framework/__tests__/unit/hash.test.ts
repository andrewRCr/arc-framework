import { describe, it, expect } from "vitest";
import { hashContent } from "../../src/lib/hash.js";

describe("hashContent", () => {
  it("produces expected SHA-256 for known content", () => {
    // echo -n "hello" | sha256sum → 2cf24dba...
    const result = hashContent("hello");
    expect(result).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces different hashes for different content", () => {
    const a = hashContent("hello");
    const b = hashContent("world");
    expect(a).not.toBe(b);
  });

  it("produces the same hash for the same content (deterministic)", () => {
    const first = hashContent("deterministic input");
    const second = hashContent("deterministic input");
    expect(first).toBe(second);
  });
});
