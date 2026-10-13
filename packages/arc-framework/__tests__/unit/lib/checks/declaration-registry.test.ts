/** Runtime identity and authored editor projection of project checks. */
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";
import { foldKernelSchemaClosure, projectKernelSchemas } from "../../../../src/lib/kernel/schema/generate.js";
import { editorDocumentReference } from "../../../../src/lib/schema-command/editor-documents.js";
import { createProductionSchemaRegistry } from "../../../../src/production-schema-registry.js";

it("registers the runtime schema as an authored editor contract", () => {
  const registry = createProductionSchemaRegistry();
  expect(registry.get("check-declaration")).toBe(CheckDeclarationSchema);
  expect(registry.meta("check-declaration")).toEqual({
    id: "check-declaration", version: 1, migrationPosture: "strict-current", authored: "editor-document",
  });
});
it("supplies the declaration's checkout-local editor reference", () => {
  expect(editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml")).toEqual({
    status: "found", reference: "# yaml-language-server: $schema=./.internal/schemas/check-declaration.schema.json",
  });
});
it("projects strict structural fields while leaving cross-field rules to runtime", () => {
  const registry = createProductionSchemaRegistry();
  const document = foldKernelSchemaClosure(projectKernelSchemas("input", registry), "check-declaration");
  const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(document);
  expect(validate({ checks: { test: { command: ["npm", "test"] } } })).toBe(true);
  for (const input of [
    { checks: {}, unknown: true },
    { checks: { test: { command: ["npm", "test"], unknown: true } } },
    { checks: { test: { command: ["npm", "test"], shards: { count: 4, argument: "{index}", unknown: true } } } },
  ]) expect(validate(input)).toBe(false);
  const runtimeInvalid = { checks: { test: { command: "npm test", shell: false } } };
  expect(validate(runtimeInvalid)).toBe(true);
  expect(CheckDeclarationSchema.safeParse(runtimeInvalid).success).toBe(false);
});
