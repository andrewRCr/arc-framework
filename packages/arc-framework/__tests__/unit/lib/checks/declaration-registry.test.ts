/** Runtime identity and authored editor projection of project checks. */
import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { CheckDeclarationSchema, registerCheckDeclarationSchemas } from "../../../../src/lib/checks/declaration.js";
import { foldKernelSchemaClosure, projectKernelSchemas } from "../../../../src/lib/kernel/schema/generate.js";
import { createRegistry } from "../../../../src/lib/kernel/schema/registry.js";
import { editorDocumentReference } from "../../../../src/lib/schema-command/editor-documents.js";
import { createProductionSchemaRegistry } from "../../../../src/production-schema-registry.js";

it("registers the runtime schema as an authored editor contract", () => {
  const registry = createProductionSchemaRegistry();
  expect(registry.get("check-declaration")).toBe(CheckDeclarationSchema);
  expect(registry.meta("check-declaration")).toEqual({
    id: "check-declaration", version: 1, migrationPosture: "strict-current", authored: "editor-document",
  });
});

it("projects runner eligibility and explicit input shape into the authored editor document", () => {
  const registry = registerCheckDeclarationSchemas(createRegistry());
  const document = foldKernelSchemaClosure(projectKernelSchemas("input", registry), "check-declaration");
  const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(document);
  const authored = { checks: { verify: { command: ["verify"], runner: true,
    environment_inputs: { CHECK_MODE: "value", CHECK_FILE: "file" } } } };
  expect(validate(authored), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ checks: { verify: { command: ["verify"], runner: "provider" } } })).toBe(false);
  expect(validate({ checks: { verify: { command: ["verify"], environment_inputs: { "INVALID-NAME": "value" } } } })).toBe(false);
  expect(validate({ checks: { verify: { command: ["verify"], environment_inputs: { CHECK_FILE: "path" } } } })).toBe(false);
  const runtimeInvalid = { checks: { verify: { ...authored.checks.verify, fixes: true } } };
  expect(validate(runtimeInvalid)).toBe(true);
  expect(CheckDeclarationSchema.safeParse(runtimeInvalid).success).toBe(false);
});
it("supplies the declaration's checkout-local editor reference", () => {
  expect(editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml")).toEqual({
    status: "found", reference: "# yaml-language-server: $schema=./.internal/schemas/check-declaration.schema.json",
  });
});
it("projects strict structural fields while leaving cross-field rules to runtime", () => {
  const registry = registerCheckDeclarationSchemas(createRegistry());
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

it("documents selection scope and enforces its authored restrictions in the editor schema", () => {
  const registry = registerCheckDeclarationSchemas(createRegistry());
  const document = foldKernelSchemaClosure(projectKernelSchemas("input", registry), "check-declaration");
  const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(document);
  expect(validate({ checks: { selected: { command: ["lint"], mode: "selection" } } })).toBe(true);
  for (const field of ["gate", "shell", "fixes", "reads_index", "ci_only", "cache", "widen", "pass_paths", "select_deletions"]) {
    const value = field === "gate" ? "commit" : field === "pass_paths" ? false : true;
    expect(validate({ checks: { selected: { command: ["lint"], mode: "selection", [field]: value } } })).toBe(false);
  }
  expect(JSON.stringify(document)).toContain("--changed");
});
