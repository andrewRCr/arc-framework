import { describe, expect, expectTypeOf, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  SlugSchema,
  isSlugSafe,
  type Slug,
} from "../../../src/lib/kernel/index.js";

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
    for (const value of invalid) assertSchemaRefuses(SlugSchema, value);
  });

  it("keeps the boolean guard aligned with schema parsing and narrows the brand", () => {
    for (const value of [...valid, ...invalid]) {
      if (isSlugSafe(value)) {
        assertSchemaAccepts(SlugSchema, value);
      } else {
        assertSchemaRefuses(SlugSchema, value);
      }
    }
    const candidate: string = "alpha-beta";
    if (isSlugSafe(candidate)) expectTypeOf(candidate).toEqualTypeOf<Slug>();
    expectTypeOf<string>().not.toExtend<Slug>();
  });
});
