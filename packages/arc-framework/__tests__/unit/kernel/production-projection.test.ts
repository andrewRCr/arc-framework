import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import { foldKernelSchemaClosure, projectKernelSchemas } from "../../../src/lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";

describe("production projection validity", () => {
  it.each(["input", "output"] as const)("validates and strictly compiles every %s root", (io) => {
    const registry = createProductionSchemaRegistry();
    const bundle = projectKernelSchemas(io, registry);
    const validator = new Ajv2020({ strict: true, validateFormats: false });
    const failures: { id: string; detail: string }[] = [];
    for (const id of registry.ids()) {
      try {
        const schema = foldKernelSchemaClosure(bundle, id);
        if (!validator.validateSchema(schema)) {
          failures.push({ id, detail: validator.errorsText() });
        } else {
          validator.compile(schema);
        }
      } catch (error) {
        failures.push({ id, detail: error instanceof Error ? error.message : String(error) });
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
