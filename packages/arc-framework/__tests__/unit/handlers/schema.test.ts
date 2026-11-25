import { describe, expect, it } from "vitest";
import { z } from "zod";

import { handleSchemaGet, handleSchemaList, type SchemaHandlerDependencies } from "../../../src/handlers/schema.js";
import { createRegistry, type KernelRegistry } from "../../../src/lib/kernel/schema/registry.js";
import {
  SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../../../src/lib/schema-command/envelope.js";

function capture(registry: () => KernelRegistry) {
  const result = { stdout: "", exitCode: 0 };
  const dependencies: SchemaHandlerDependencies = {
    registry, write: (text) => { result.stdout += text; }, setExitCode: (code) => { result.exitCode = code; },
  };
  return { result, dependencies };
}

describe("schema discovery handlers", () => {
  it("lists every registered identity with metadata in compact JSON", () => {
    const registry = createRegistry();
    registry.register(z.strictObject({ count: z.number() }), {
      id: "editor", version: 2, migrationPosture: "strict-current", authored: "editor-document",
    });
    registry.register(z.strictObject({ label: z.string() }), {
      id: "payload", version: 5, migrationPosture: "backward-compatible",
    });
    const { result, dependencies } = capture(() => registry);
    handleSchemaList({ json: true }, undefined, dependencies);
    expect(JSON.parse(result.stdout)).toEqual({ status: "ok", schemas: [
      { id: "editor", version: 2, migrationPosture: "strict-current",
        editorDocument: { path: ".arc/system/.internal/schemas/editor.schema.json" } },
      { id: "payload", version: 5, migrationPosture: "backward-compatible", editorDocument: null },
    ] });
    expect(result.stdout.split("\n")).toHaveLength(2);
    expect(SchemaListEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("lists plain metadata without projecting an unrepresentable root", () => {
    const registry = createRegistry();
    registry.register(z.custom(), { id: "opaque", version: 5, migrationPosture: "backward-compatible" });
    const { result, dependencies } = capture(() => registry);
    handleSchemaList({}, undefined, dependencies);
    expect(result.stdout.trim().split("\n")).toEqual(["opaque 5 backward-compatible"]);
    expect(result.exitCode).toBe(0);
  });

  it("gets a request root on its input side", () => {
    const registry = createRegistry();
    registry.register(z.strictObject({ label: z.string(), enabled: z.boolean().default(false) }), {
      id: "request", version: 4, migrationPosture: "strict-current", authored: "request",
    });
    const { result, dependencies } = capture(() => registry);
    handleSchemaGet("request", undefined, dependencies);
    const payload: unknown = JSON.parse(result.stdout);
    expect(payload).toEqual({
      status: "ok", id: "request", version: 4, migrationPosture: "strict-current", editorDocument: null,
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema", $id: "urn:arc:schema:request",
        type: "object", properties: { label: { type: "string" }, enabled: { default: false, type: "boolean" } },
        required: ["label"], additionalProperties: false,
      },
    });
    expect(SchemaGetEnvelopeSchema.safeParse(payload).success).toBe(true);
    expect(result.stdout.split("\n")).toHaveLength(2);
  });

  it("reports a marked editor document through its layout address", () => {
    const registry = createRegistry();
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
    const registry = createRegistry();
    registry.register(z.custom(), { id: "opaque", version: 1, migrationPosture: "strict-current" });
    const { result, dependencies } = capture(() => registry);
    handleSchemaGet("missing", undefined, dependencies);
    expect(JSON.parse(result.stdout)).toEqual({
      status: "refused", reason: "unknown-schema-id", id: "missing", remedy: "arc schema list",
    });
    expect(result.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.safeParse(JSON.parse(result.stdout)).success).toBe(true);
  });
});
