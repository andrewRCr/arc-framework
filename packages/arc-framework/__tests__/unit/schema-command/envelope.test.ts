import { describe, expect, it } from "vitest";
import { createKernelRegistry } from "../../../src/lib/kernel/index.js";
import {
  registerSchemaCommandSchemas, SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../../../src/lib/schema-command/envelope.js";

const metadata = { id: "slug", version: 1, migrationPosture: "strict-current", editorDocument: null };

describe("schema command envelopes", () => {
  it("closes list results over complete metadata", () => {
    expect(SchemaListEnvelopeSchema.safeParse({ status: "ok", schemas: [metadata] }).success).toBe(true);
    expect(SchemaListEnvelopeSchema.safeParse({ status: "ok", schemas: [{ ...metadata, version: 0 }] }).success).toBe(false);
    expect(SchemaListEnvelopeSchema.safeParse({ status: "ok", schemas: [metadata], unexpected: true }).success).toBe(false);
  });

  it("requires a document in get results", () => {
    expect(SchemaGetEnvelopeSchema.safeParse({ status: "ok", ...metadata, schema: { type: "string" } }).success).toBe(true);
    expect(SchemaGetEnvelopeSchema.safeParse({ status: "ok", ...metadata, schema: "not-a-document" }).success).toBe(false);
  });

  it("closes refusal results over the supported reason and remedy", () => {
    const refusal = { status: "refused", reason: "unknown-schema-id", id: "missing", remedy: "arc schema list" };
    expect(SchemaRefusalEnvelopeSchema.safeParse(refusal).success).toBe(true);
    expect(SchemaRefusalEnvelopeSchema.safeParse({ ...refusal, reason: "invented" }).success).toBe(false);
  });

  it("registers every result contract with its own identity", () => {
    const registry = registerSchemaCommandSchemas(createKernelRegistry());
    for (const [id, schema] of [
      ["schema-list-envelope", SchemaListEnvelopeSchema],
      ["schema-get-envelope", SchemaGetEnvelopeSchema],
      ["schema-refusal-envelope", SchemaRefusalEnvelopeSchema],
    ] as const) {
      expect(registry.get(id)).toBe(schema);
      expect(registry.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
    }
  });
});
