import { describe, expect, it } from "vitest";
import {
  handleSchemaInstall, type SchemaInstallDependencies,
} from "../../../src/handlers/schema.js";
import { SchemaInstallEnvelopeSchema, SchemaRefusalEnvelopeSchema } from "../../../src/lib/schema-command/envelope.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";
import { ARC_PROJECT_ROOT_ERROR } from "../../../src/handlers/shared.js";

const documents = [".arc/system/.internal/schemas/editor.schema.json"];
function capture(overrides: Partial<SchemaInstallDependencies> = {}) {
  const result = { stdout: "", stderr: "", exitCode: 0 };
  const dependencies: SchemaInstallDependencies = {
    registry: createProductionSchemaRegistry, resolveRoot: () => "/project",
    writeDocuments: async () => ({ ok: true, documents }),
    write: (text) => { result.stdout += text; }, writeError: (text) => { result.stderr += text; },
    setExitCode: (code) => { result.exitCode = code; }, ...overrides,
  };
  return { result, dependencies };
}

describe("schema install handler", () => {
  it("emits validated compact JSON with the written paths", async () => {
    const { result, dependencies } = capture();
    await handleSchemaInstall({ json: true }, undefined, dependencies);
    expect(JSON.parse(result.stdout)).toEqual({ status: "ok", documents });
    expect(SchemaInstallEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    expect(result.stdout.split("\n")).toHaveLength(2);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("lists the written paths in plain mode", async () => {
    const { result, dependencies } = capture();
    await handleSchemaInstall({}, undefined, dependencies);
    expect(result.stdout).toBe(`${documents.join("\n")}\n`);
    expect(result.stderr).toBe("");
  });

  it("refuses an unresolved project in JSON without a human prefix", async () => {
    const { result, dependencies } = capture({ resolveRoot: () => null,
      writeDocuments: async () => { throw new Error("Must not write outside a project"); } });
    await handleSchemaInstall({ json: true }, undefined, dependencies);
    expect(JSON.parse(result.stdout)).toEqual({ status: "refused", reason: "arc-project-root-unresolved" });
    expect(SchemaRefusalEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
  });

  it("prints the canonical unresolved-project message in plain mode", async () => {
    const { result, dependencies } = capture({ resolveRoot: () => null });
    await handleSchemaInstall({}, undefined, dependencies);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(`${ARC_PROJECT_ROOT_ERROR}\n`);
    expect(result.exitCode).toBe(1);
  });

  it.each(["documents", "exclude"] as const)("refuses a %s failure with its reported path and retry remedy", async (target) => {
    const failure = { target, path: "/project/failed-path", detail: "permission denied" };
    const { result, dependencies } = capture({ writeDocuments: async () => ({ ok: false, ...failure }) });
    await handleSchemaInstall({ json: true }, undefined, dependencies);
    const payload = JSON.parse(result.stdout) as { remedy: string };
    expect(payload).toMatchObject({ status: "refused", reason: "editor-documents-unwritable", ...failure });
    expect(payload.remedy).toContain("permission denied");
    expect(payload.remedy).toContain("arc schema install");
    expect(SchemaRefusalEnvelopeSchema.safeParse(payload).success).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it("omits an unavailable exclude path from its validated refusal", async () => {
    const { result, dependencies } = capture({ writeDocuments: async () => ({ ok: false, target: "exclude", detail: "No Git checkout" }) });
    await handleSchemaInstall({ json: true }, undefined, dependencies);
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload).toMatchObject({ status: "refused", reason: "editor-documents-unwritable", target: "exclude" });
    expect(payload).not.toHaveProperty("path");
    expect(SchemaRefusalEnvelopeSchema.safeParse(payload).success).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it("prints the underlying cause and retry command on a plain failure", async () => {
    const { result, dependencies } = capture({ writeDocuments: async () => ({ ok: false, target: "exclude", detail: "exclude denied" }) });
    await handleSchemaInstall({}, undefined, dependencies);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("exclude denied");
    expect(result.stderr).toContain("arc schema install");
    expect(result.exitCode).toBe(1);
  });

  it("lets projection defects reach the ordinary CLI error path", async () => {
    const { result, dependencies } = capture({ writeDocuments: async () => { throw new Error("Projection defect"); } });
    await expect(handleSchemaInstall({ json: true }, undefined, dependencies)).rejects.toThrow("Projection defect");
    expect(result.stdout).toBe("");
  });
});
