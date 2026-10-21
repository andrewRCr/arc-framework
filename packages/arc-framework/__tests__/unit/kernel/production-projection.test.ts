import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import type { KernelRegistry } from "../../../src/lib/kernel/index.js";
import { foldKernelSchemaClosure, projectKernelSchemas } from "../../../src/lib/kernel/schema/generate.js";
import {
  createEditorDocumentSchemaRegistry, createProductionSchemaRegistry,
} from "../../../src/production-schema-registry.js";

function editorDocumentIds(registry: KernelRegistry): string[] {
  return registry.ids().filter((id) => registry.meta(id)?.authored === "editor-document");
}

/** Number generated definition names by first use, since their counter starts wherever the projection began. */
function renumberGeneratedDefinitions(document: string): string {
  const names = new Map<string, string>();
  return document.replace(/__schema\d+/gu, (name) => {
    if (!names.has(name)) names.set(name, `__schema${names.size}`);
    return names.get(name)!;
  });
}

describe("production projection validity", () => {
  it("publishes every production editor document from its own schema families, apart from generated names", () => {
    const production = createProductionSchemaRegistry();
    const families = createEditorDocumentSchemaRegistry();
    const ids = editorDocumentIds(production);
    expect(ids).not.toEqual([]);
    expect(editorDocumentIds(families)).toEqual(ids);
    const complete = projectKernelSchemas("input", production);
    const scoped = projectKernelSchemas("input", families);
    for (const id of ids) {
      const own = JSON.stringify(foldKernelSchemaClosure(scoped, id), null, 2);
      const surface = JSON.stringify(foldKernelSchemaClosure(complete, id), null, 2);
      expect(renumberGeneratedDefinitions(own)).toBe(renumberGeneratedDefinitions(surface));
    }
  }, 60_000);

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
