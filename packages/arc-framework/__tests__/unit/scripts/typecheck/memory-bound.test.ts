import { describe, expect, it } from "vitest";
import { addressSpaceBackstop, parseAddressSpaceLimits } from "../../../../src/scripts/typecheck/memory-bound.js";

describe("address-space backstop", () => {
  it("adds the provisional margin and expresses the ceiling in KiB", () => {
    expect(addressSpaceBackstop(6000, {})).toBe(7817 * 1024);
  });
  it.each(["soft", "hard"] as const)("keeps a lower inherited %s ceiling", column => {
    expect(addressSpaceBackstop(6000, { [column]: 2 * 1024 ** 3 })).toBeUndefined();
  });
  it("parses both inherited columns", () => {
    expect(parseAddressSpaceLimits("Max address space         2147483648           4294967296           bytes"))
      .toEqual({ soft: 2147483648, hard: 4294967296 });
  });
  it("reads unlimited columns as absent ceilings", () => {
    expect(parseAddressSpaceLimits("Max address space         unlimited            unlimited            bytes"))
      .toEqual({});
  });
});
