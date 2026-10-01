/** Unit coverage for schema-backed resolved work-class composition tallies. */

import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";

import {
  ClassCompositionSchema,
  classComposition,
} from "../../../src/lib/status/class-composition.js";
import type { StatusViewRow } from "../../../src/lib/status/render.js";

describe("classComposition", () => {
  it("tallies resolved classes and preserves runtime field order", () => {
    const rows: StatusViewRow[] = [
      { workUnit: "novel", class: "Novel" },
      { workUnit: "heavy-a", class: "Heavy" },
      { workUnit: "heavy-b", class: "Heavy" },
      { workUnit: "light", class: "Light" },
    ];

    const result = classComposition(rows);

    expect(result).toEqual({ heavy: 2, light: 1, novel: 1 });
    expect(Object.keys(result)).toEqual(["heavy", "light", "novel"]);
  });

  it("returns an all-zero composition for an empty slice", () => {
    expect(classComposition([])).toEqual({ heavy: 0, light: 0, novel: 0 });
  });
});

describe("ClassCompositionSchema", () => {
  it.each([
    { heavy: -1, light: 0, novel: 0 },
    { heavy: 0, light: 1.5, novel: 0 },
    { heavy: 0, light: 0, novel: Number.NaN },
    { heavy: 0, light: 0, novel: 0, leaked: true },
  ])("rejects malformed numeric values", (value) => {
    assertSchemaRefuses(ClassCompositionSchema, value);
  });
});
