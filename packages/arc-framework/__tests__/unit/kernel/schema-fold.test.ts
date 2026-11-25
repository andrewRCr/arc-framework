import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createKernelRegistry, createRegistry, type KernelJSONSchemaBundle } from "../../../src/lib/kernel/index.js";
import { foldKernelSchemaClosure, projectKernelSchemaClosure } from "../../../src/lib/kernel/schema/generate.js";

const dialect = "https://json-schema.org/draft/2020-12/schema";
const identity = (id: string) => ({ $id: `urn:arc:schema:${id}`, $schema: dialect } as const);

function fixture(): KernelJSONSchemaBundle {
  const repeated = { $ref: "urn:arc:schema:__shared#/$defs/used" };
  return { schemas: {
    root: { ...identity("root"), type: "object", properties: {
      child: { $ref: "urn:arc:schema:child" }, first: repeated, second: repeated,
    } },
    child: { ...identity("child"), type: "object", properties: { nested: repeated } },
    __shared: { ...identity("__shared"), $defs: {
      used: { type: "string", pattern: "^value$" },
      unreachable: { type: "number" },
    } },
  } };
}

describe("self-contained schema folding", () => {
  it.each(["https://example.test/data", "urn:arc:schema:slug"])(
    "preserves a parsed JSON default containing a reference-like value: %s", (reference) => {
      const registry = createKernelRegistry();
      const data = { $ref: reference };
      const schema = z.object({ value: z.unknown().default(data) });
      registry.register(schema, { id: "data-default", version: 1, migrationPosture: "strict-current", authored: "request" });
      expect(schema.parse({})).toEqual({ value: data });
      expect(projectKernelSchemaClosure(registry, "data-default")).toMatchObject({ properties: { value: { default: data } } });
    },
  );

  it.each(["const", "enum", "examples"])("preserves instance data under %s", (keyword) => {
    const registry = createKernelRegistry();
    const data = { $ref: "urn:arc:schema:slug", properties: { nested: { $ref: "https://example.test/data" } } };
    const value = keyword === "const" ? data : [data];
    registry.register(z.unknown().meta({ [keyword]: value }), {
      id: "data-annotation", version: 1, migrationPosture: "strict-current",
    });
    const result = projectKernelSchemaClosure(registry, "data-annotation");
    expect(result[keyword]).toEqual(value);
    expect(result.$defs).toBeUndefined();
  });

  it("folds registered and shared dependencies into local definitions without mutating the bundle", () => {
    const bundle = fixture();
    const before = JSON.stringify(bundle);
    const result = foldKernelSchemaClosure(bundle, "root");
    expect(result).toEqual({ ...identity("root"), type: "object", properties: {
      child: { $ref: "#/$defs/child" }, first: { $ref: "#/$defs/__used" }, second: { $ref: "#/$defs/__used" },
    }, $defs: {
      child: { type: "object", properties: { nested: { $ref: "#/$defs/__used" } } },
      __used: { type: "string", pattern: "^value$" },
    } });
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it("refuses a definition key collision", () => {
    const bundle = fixture();
    const root = bundle.schemas.root;
    if (root === undefined) throw new Error("Missing test root");
    root.$defs = { child: { type: "boolean" } };
    expect(() => foldKernelSchemaClosure(bundle, "root")).toThrow(/collision/u);
  });

  it.each(["child.schema.json", "#/$defs/existing", "urn:other:child", "urn:arc:schema:missing"])(
    "refuses an unsupported or unavailable reference: %s", (reference) => {
      const bundle = { schemas: { root: { ...identity("root"), $ref: reference } } };
      expect(() => foldKernelSchemaClosure(bundle, "root")).toThrow();
    },
  );

  it("reserves a dependency before following its recursive references", () => {
    const bundle: KernelJSONSchemaBundle = { schemas: {
      root: { ...identity("root"), $ref: "urn:arc:schema:child" },
      child: { ...identity("child"), type: "object", properties: { self: { $ref: "urn:arc:schema:child" } } },
    } };
    expect(foldKernelSchemaClosure(bundle, "root")).toEqual({ ...identity("root"), $ref: "#/$defs/child", $defs: {
      child: { type: "object", properties: { self: { $ref: "#/$defs/child" } } },
    } });
  });

  it.each(["request", "editor-document", undefined] as const)("projects the declared authored side: %s", (authored) => {
    const registry = createRegistry();
    registry.register(z.strictObject({ value: z.string().default("value") }), {
      id: "authored", version: 1, migrationPosture: "strict-current", ...(authored === undefined ? {} : { authored }),
    });
    const result = projectKernelSchemaClosure(registry, "authored");
    expect(result.$id).toBe("urn:arc:schema:authored");
    expect(result.required ?? []).toEqual(authored === undefined ? ["value"] : []);
  });
});
