import { describe, expect, it } from "vitest";

import { isGitObjectId } from "../../../src/lib/git/object-id.js";

describe("isGitObjectId", () => {
  it.each(["a".repeat(40), "b".repeat(64)])("accepts an exact lowercase object id", (oid) => {
    expect(isGitObjectId(oid)).toBe(true);
  });

  it.each([
    "a".repeat(39),
    "a".repeat(41),
    "b".repeat(63),
    "b".repeat(65),
    "A".repeat(40),
  ])("rejects a non-exact object id", (oid) => {
    expect(isGitObjectId(oid)).toBe(false);
  });
});
