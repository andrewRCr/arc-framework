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

// Installation shares the command family's closed result contract.
describe("schema installation envelopes", () => {
  it("validates installation paths and rejects non-path values", async () => {
    const { SchemaInstallEnvelopeSchema } = await import("../../../src/lib/schema-command/envelope.js");
    expect(SchemaInstallEnvelopeSchema.safeParse({ status: "ok", documents: [] }).success).toBe(true);
    expect(SchemaInstallEnvelopeSchema.safeParse({ status: "ok", documents: [1] }).success).toBe(false);
  });

  it("admits exactly the additional project and write refusals", () => {
    expect(SchemaRefusalEnvelopeSchema.safeParse({ status: "refused", reason: "arc-project-root-unresolved" }).success).toBe(true);
    expect(SchemaRefusalEnvelopeSchema.safeParse({ status: "refused", reason: "editor-documents-unwritable",
      target: "exclude", detail: "Git unavailable", remedy: "Correct Git access and rerun arc schema install." }).success).toBe(true);
    expect(SchemaRefusalEnvelopeSchema.safeParse({ status: "refused", reason: "editor-documents-unwritable",
      target: "invented", detail: "denied", remedy: "retry" }).success).toBe(false);
  });

  it("registers the installation result with the production contracts", async () => {
    const { SchemaInstallEnvelopeSchema } = await import("../../../src/lib/schema-command/envelope.js");
    const registry = registerSchemaCommandSchemas(createKernelRegistry());
    expect(registry.get("schema-install-envelope")).toBe(SchemaInstallEnvelopeSchema);
  });
});
