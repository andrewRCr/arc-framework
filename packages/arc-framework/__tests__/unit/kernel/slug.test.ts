import { describe, expect, expectTypeOf, it } from "vitest";

import {
  SLUG_PATTERN,
  SlugSchema,
  isSlugSafe,
  type Slug,
} from "../../../src/lib/kernel/index.js";
import {
  SLUG_PATTERN as OldSlugPattern,
  SlugSchema as OldSlugSchema,
  isSlugSafe as oldIsSlugSafe,
  type Slug as OldSlug,
} from "../../../src/lib/work-unit/slug.js";

const valid = ["a", "abc", "a1", "alpha-beta", "one-2-three"];
const invalid = ["", "Alpha", "alpha_beta", "alpha/beta", "alpha\\beta", ".", "..", "a..b", "-alpha", "alpha-", "alpha--beta"];

describe("kernel slug contract", () => {
  it("parses lowercase alphanumeric segments joined by single hyphens", () => {
    for (const value of valid) {
      const parsed = SlugSchema.parse(value);
      expect(parsed).toBe(value);
      expectTypeOf(parsed).toEqualTypeOf<Slug>();
    }
  });

  it("rejects unsafe and non-canonical path identities", () => {
    for (const value of invalid) expect(SlugSchema.safeParse(value).success).toBe(false);
  });

  it("keeps the boolean guard aligned with schema parsing and narrows the brand", () => {
    for (const value of [...valid, ...invalid]) {
      expect(isSlugSafe(value)).toBe(SlugSchema.safeParse(value).success);
    }
    const candidate: string = "alpha-beta";
    if (isSlugSafe(candidate)) expectTypeOf(candidate).toEqualTypeOf<Slug>();
    expectTypeOf<string>().not.toExtend<Slug>();
  });

  it("preserves the work-unit import path by identity and type", () => {
    expect(OldSlugPattern).toBe(SLUG_PATTERN);
    expect(OldSlugSchema).toBe(SlugSchema);
    expect(oldIsSlugSafe).toBe(isSlugSafe);
    expectTypeOf<OldSlug>().toEqualTypeOf<Slug>();
  });
});
