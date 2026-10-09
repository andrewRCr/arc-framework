import { describe, expect, it } from "vitest";
import { z } from "zod";

import { handleSchemaGet, handleSchemaList, type SchemaHandlerDependencies } from "../../../src/handlers/schema.js";
import { createKernelRegistry, type KernelRegistry } from "../../../src/lib/kernel/index.js";
import {
  SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../../../src/lib/schema-command/envelope.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";

function capture(registry: () => KernelRegistry = createProductionSchemaRegistry) {
  const result = { stdout: "", exitCode: 0 };
  const dependencies: SchemaHandlerDependencies = {
    registry, write: (text) => { result.stdout += text; }, setExitCode: (code) => { result.exitCode = code; },
  };
  return { result, dependencies };
}

describe("schema discovery handlers", () => {
  it("lists every production identity with metadata in compact JSON", () => {
    const { result, dependencies } = capture();
    handleSchemaList({ json: true }, undefined, dependencies);
    const registry = createProductionSchemaRegistry();
    expect(JSON.parse(result.stdout)).toEqual({ status: "ok", schemas: registry.ids().map((id) => ({
      id, version: registry.meta(id)?.version, migrationPosture: registry.meta(id)?.migrationPosture, editorDocument: null,
    })) });
    expect(result.stdout.split("\n")).toHaveLength(2);
    expect(SchemaListEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("lists plain metadata without projecting an unrepresentable root", () => {
    const registry = createKernelRegistry();
    registry.register(z.custom(), { id: "opaque", version: 5, migrationPosture: "backward-compatible" });
    const { result, dependencies } = capture(() => registry);
    handleSchemaList({}, undefined, dependencies);
    expect(result.stdout.trim().split("\n")).toEqual(registry.ids().map((id) => {
      const meta = registry.meta(id);
      return `${id} ${meta?.version} ${meta?.migrationPosture}`;
    }));
    expect(result.exitCode).toBe(0);
  });

  it("gets a request root on its input side", () => {
    const { result, dependencies } = capture();
    handleSchemaGet("review-resolve-request", undefined, dependencies);
    const payload = JSON.parse(result.stdout) as { status: string; schema: { $id: string; required: string[] } };
    expect(payload.status).toBe("ok");
    expect(payload.schema.$id).toBe("urn:arc:schema:review-resolve-request");
    expect(payload.schema.required).not.toContain("frontlineActive");
    expect(SchemaGetEnvelopeSchema.safeParse(payload).success).toBe(true);
    expect(result.stdout.split("\n")).toHaveLength(2);
  });

  it("reports a marked editor document through its layout address", () => {
    const registry = createKernelRegistry();
    registry.register(z.strictObject({ count: z.number(), $schema: z.string().optional() }), {
      id: "editor", version: 2, migrationPosture: "strict-current", authored: "editor-document",
    });
    const { result, dependencies } = capture(() => registry);
    handleSchemaGet("editor", undefined, dependencies);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "ok", id: "editor", version: 2,
      editorDocument: { path: ".arc/system/.internal/schemas/editor.schema.json" } });
    expect(SchemaGetEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
  });

  it("refuses an unknown identity with its discovery remedy", () => {
    const { result, dependencies } = capture();
    handleSchemaGet("missing", undefined, dependencies);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "refused", reason: "unknown-schema-id", id: "missing", remedy: "arc schema list",
    });
    expect(result.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
  });
});
