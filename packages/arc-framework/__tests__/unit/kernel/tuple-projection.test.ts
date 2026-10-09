import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createRegistry } from "../../../src/lib/kernel/index.js";

function project(schema: z.ZodType, io: "input" | "output") {
  const registry = createRegistry();
  registry.register(schema, { id: "tuple", version: 1, migrationPosture: "strict-current" });
  return registry.toJSONSchema({ io }).schemas.tuple;
}

describe("tuple projection bounds", () => {
  it("bounds a fixed tuple to its exact length", () => {
    expect(project(z.tuple([z.literal("arc"), z.string()]), "output"))
      .toMatchObject({ minItems: 2, maxItems: 2 });
  });

  it("uses the side's optional tail rather than the other side's defaults", () => {
    const tuple = z.tuple([z.string(), z.string().default("default")]);
    expect(project(tuple, "input")).toMatchObject({ minItems: 1, maxItems: 2 });
    expect(project(tuple, "output")).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(project(z.tuple([z.string().optional()]), "input")).toMatchObject({ minItems: 0, maxItems: 1 });
  });

  it("keeps a rest tuple unbounded above", () => {
    const result = project(z.tuple([z.string()], z.number()), "output");
    expect(result).toMatchObject({ minItems: 1 });
    expect(result).not.toHaveProperty("maxItems");
  });

  it("projects an empty tuple without an invalid empty prefix", () => {
    const result = project(z.tuple([]), "output");
    expect(result).not.toHaveProperty("prefixItems");
    expect(result).toMatchObject({ minItems: 0, maxItems: 0 });
  });
});
