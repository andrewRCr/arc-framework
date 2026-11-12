/** Unit coverage for validation-surface schema registry composition. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import { ArcConfigSchema } from "../../../src/lib/config/schema.js";
import {
  PrioritySchema,
  SchemaError,
  SlugSchema,
  WorkClassSchema,
  WorkUnitStateSchema,
} from "../../../src/lib/kernel/index.js";
import {
  projectKernelSchemas,
  serializeKernelSchemaBundle,
} from "../../../src/lib/kernel/schema/generate.js";
import { AuditEntrySchema } from "../../../src/lib/release/schema.js";
import { PersistedLocalSyncStateSchema } from "../../../src/lib/user-sync/schema.js";
import {
  VALIDATION_SURFACE_SCHEMA_IDS,
  createValidationSurfacesRegistry,
} from "../../../src/lib/validation-surfaces/registry.js";

const strict = (id: string, version: number) => ({
  id,
  version,
  migrationPosture: "strict-current" as const,
});

describe("validation-surfaces schema registry", () => {
  it("registers each declared root at its owning schema and metadata", () => {
    const registry = createValidationSurfacesRegistry();

    expect(registry.get(VALIDATION_SURFACE_SCHEMA_IDS.auditEntry)).toBe(AuditEntrySchema);
    expect(registry.meta(VALIDATION_SURFACE_SCHEMA_IDS.auditEntry)).toEqual(strict("audit-entry", 2));
    expect(registry.get(VALIDATION_SURFACE_SCHEMA_IDS.metaRecord)).toBe(MetaRecordSchema);
    expect(registry.meta(VALIDATION_SURFACE_SCHEMA_IDS.metaRecord)).toEqual(strict("meta-record", 1));
    expect(registry.get(VALIDATION_SURFACE_SCHEMA_IDS.arcConfig)).toBe(ArcConfigSchema);
    expect(registry.meta(VALIDATION_SURFACE_SCHEMA_IDS.arcConfig)).toEqual(strict("arc-config", 1));
    expect(registry.get(VALIDATION_SURFACE_SCHEMA_IDS.localSyncState)).toBe(PersistedLocalSyncStateSchema);
    expect(registry.meta(VALIDATION_SURFACE_SCHEMA_IDS.localSyncState)).toEqual({
      id: "local-sync-state",
      version: 4,
      migrationPosture: "backward-compatible",
    });
  });

  it("retains kernel vocabulary in deterministic identity order", () => {
    const registry = createValidationSurfacesRegistry();

    expect(registry.ids()).toEqual([
      "arc-config",
      "audit-entry",
      "local-sync-state",
      "meta-record",
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ]);
    expect(registry.get("priority")).toBe(PrioritySchema);
    expect(registry.get("slug")).toBe(SlugSchema);
    expect(registry.get("work-class")).toBe(WorkClassSchema);
    expect(registry.get("work-unit-state")).toBe(WorkUnitStateSchema);
  });

  it("returns a fresh registry on every call", () => {
    const first = createValidationSurfacesRegistry();
    const second = createValidationSurfacesRegistry();

    first.register(z.boolean(), strict("extension", 1));

    expect(second.get("extension")).toBeUndefined();
  });

  it("preserves duplicate identity and schema rejection", () => {
    const registry = createValidationSurfacesRegistry();

    expect(() => registry.register(z.string(), strict("audit-entry", 3))).toThrowError(
      expect.objectContaining<Partial<SchemaError>>({ code: "schema.registry.duplicate-identity" }),
    );
    expect(() => registry.register(AuditEntrySchema, strict("renamed-audit", 2))).toThrowError(
      expect.objectContaining<Partial<SchemaError>>({ code: "schema.registry.duplicate-schema" }),
    );
  });

  it("keeps default publication kernel-only and composed projection opt-in", () => {
    const defaultBytes = serializeKernelSchemaBundle(projectKernelSchemas("output"));
    const registry = createValidationSurfacesRegistry();
    const composed = projectKernelSchemas("output", registry);

    expect(serializeKernelSchemaBundle(projectKernelSchemas("output"))).toBe(defaultBytes);
    expect(Object.keys(JSON.parse(defaultBytes).schemas as object)).toEqual([
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ]);
    expect(Object.keys(composed.schemas)).toEqual([...registry.ids(), "__shared"]);
    expect(composed.schemas[VALIDATION_SURFACE_SCHEMA_IDS.metaRecord]?.properties?.state).toEqual({
      $ref: "urn:arc:schema:work-unit-state",
    });
  });

  it("projects deterministic composed bytes with closed resolvable identities", () => {
    const first = projectKernelSchemas("output", createValidationSurfacesRegistry());
    const second = projectKernelSchemas("output", createValidationSurfacesRegistry());
    const ids = Object.keys(first.schemas);

    expect(serializeKernelSchemaBundle(second)).toBe(serializeKernelSchemaBundle(first));
    expect(ids).toEqual([
      "arc-config",
      "audit-entry",
      "local-sync-state",
      "meta-record",
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
      "__shared",
    ]);
    for (const id of ids) expect(first.schemas[id]?.$id).toBe(`urn:arc:schema:${id}`);

    const references = [...serializeKernelSchemaBundle(first).matchAll(/"\$ref": "([^"]+)"/gu)]
      .map((match) => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(ids.map((id) => `urn:arc:schema:${id}`)).toContain(reference?.split("#")[0]);
    }
  });
});
