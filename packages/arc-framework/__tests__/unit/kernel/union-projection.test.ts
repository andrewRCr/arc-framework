/** Primitive unions stay compilable without changing schema constraints or instance metadata. */
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { z } from "zod";
import { createRegistry } from "../../../src/lib/kernel/index.js";
import { foldKernelSchemaClosure } from "../../../src/lib/kernel/schema/generate.js";

it.each(["input", "output"] as const)("strictly compiles primitive unions on the %s side", io => {
  const schema = z.strictObject({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]) });
  const registry = createRegistry();
  registry.register(schema, { id: "primitive", version: 1, migrationPosture: "strict-current" });
  const document = foldKernelSchemaClosure(registry.toJSONSchema({ io }), "primitive");
  const validate = new Ajv2020({ strict: true }).compile(document);
  for (const value of ["text", 5, true, null, [], {}]) {
    expect(validate({ value })).toBe(schema.safeParse({ value }).success);
  }
});

it("preserves defaults that contain type-like instance data", () => {
  const defaults = { type: ["string", "number"], anyOf: [{ type: "custom-value" }] };
  const schema = z.strictObject({
    value: z.union([z.string(), z.number()]),
    configuration: z.strictObject({ type: z.array(z.string()), anyOf: z.array(z.strictObject({ type: z.string() })) }).default(defaults),
  });
  const registry = createRegistry();
  registry.register(schema, { id: "metadata", version: 1, migrationPosture: "strict-current" });
  const document = foldKernelSchemaClosure(registry.toJSONSchema({ io: "input" }), "metadata");
  const validate = new Ajv2020({ strict: true, useDefaults: true }).compile(document);
  const input: Record<string, unknown> = { value: "text" };
  expect(validate(input)).toBe(true);
  expect(input.configuration).toEqual(defaults);
});
