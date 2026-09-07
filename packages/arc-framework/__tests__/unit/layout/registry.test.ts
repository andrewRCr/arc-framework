/** Unit coverage for layout registry and error composition. */

import { describe, expect, expectTypeOf, it } from "vitest";

import {
  LAYOUT_SCHEMA_IDS,
  LayoutError,
  createLayoutRegistry,
  type LayoutErrorCode,
} from "../../../src/lib/layout/index.js";

describe("layout registry", () => {
  it("registers exactly ten layout roots over a fresh kernel registry", () => {
    const first = createLayoutRegistry();
    const second = createLayoutRegistry();

    expect(first.ids().filter((id) => id.startsWith("layout-"))).toEqual(
      Object.values(LAYOUT_SCHEMA_IDS).sort(),
    );
    expect(Object.values(LAYOUT_SCHEMA_IDS)).toHaveLength(10);
    for (const id of Object.values(LAYOUT_SCHEMA_IDS)) {
      expect(first.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
      expect(first.get(id)).toBeDefined();
    }
    expect(second.ids()).toEqual(first.ids());
    expect(second).not.toBe(first);
  });
});

describe("LayoutError", () => {
  it("preserves its cause and exposes a locally exhaustive code", () => {
    const cause = new Error("invalid source");
    const error = new LayoutError("bad address", "layout.invalid-address", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("LayoutError");
    expect(error.cause).toBe(cause);
    expectTypeOf(error.code).toEqualTypeOf<LayoutErrorCode>();
  });
});
