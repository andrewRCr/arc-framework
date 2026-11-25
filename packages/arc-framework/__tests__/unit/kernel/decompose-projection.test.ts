import { describe, expect, it } from "vitest";

import { projectKernelSchemaClosure } from "../../../src/lib/kernel/schema/generate.js";
import { V3DecomposeCutMapSchema } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";

describe("production decompose contract", () => {
  it("composes the cut map with its version, posture, and request side", () => {
    const registry = createProductionSchemaRegistry();
    expect(registry.get("decompose-cut-map")).toBe(V3DecomposeCutMapSchema);
    expect(registry.meta("decompose-cut-map")).toEqual({
      id: "decompose-cut-map", version: 3, migrationPosture: "strict-current", authored: "request",
    });
  });

  it("folds the registered slug into the cut map's input document", () => {
    const schema = projectKernelSchemaClosure(createProductionSchemaRegistry(), "decompose-cut-map");
    expect(schema.$id).toBe("urn:arc:schema:decompose-cut-map");
    expect(schema.$defs?.slug).toMatchObject({ type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" });
    expect(JSON.stringify(schema)).toContain('"$ref":"#/$defs/slug"');
    expect(JSON.stringify(schema)).not.toMatch(/"\$ref":"(?!#)/u);
  });
});
