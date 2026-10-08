/**
 * Versioned schema discovery and deterministic JSON Schema projection.
 */

import { z } from "zod";

import { ArcError } from "../errors.js";
import { SlugSchema } from "./slug.js";
import {
  PrioritySchema,
  RemoteEvidenceSchema,
  RemoteFailureReasonSchema,
  WorkClassSchema,
  WorkUnitStateSchema,
} from "./vocabulary.js";

/** Supported evolution posture for a registered schema identity. */
export type MigrationPosture = "strict-current" | "backward-compatible";

/** Version and migration metadata held outside emitted JSON Schema. */
export interface KernelSchemaMeta {
  readonly id: string;
  readonly version: number;
  readonly migrationPosture: MigrationPosture;
  /**
   * Authored contracts project their input side. An editor document describes the real values a
   * standard YAML or JSON parser yields, uses strict objects wherever the CLI rejects unknown
   * keys, and admits `$schema` when its files may be JSON.
   */
  readonly authored?: "request" | "editor-document";
}

/** One JSON Schema emitted by the kernel projection. */
export type KernelJSONSchema = z.core.JSONSchema.BaseSchema;

/** Deterministic bundle keyed by stable schema identity. */
export interface KernelJSONSchemaBundle {
  readonly schemas: Record<string, KernelJSONSchema>;
}

/** Required side and optional identity mapping for one registry projection. */
export interface KernelProjectionOptions {
  readonly io: "input" | "output";
  readonly uri?: (id: string) => string;
}

/** Public discovery and projection contract for kernel and subsystem schemas. */
export interface KernelRegistry {
  register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T;
  get(id: string): z.ZodType | undefined;
  meta(id: string): KernelSchemaMeta | undefined;
  ids(): readonly string[];
  toJSONSchema(options: KernelProjectionOptions): KernelJSONSchemaBundle;
}

/** Stable schema-registry failure variants. */
export type SchemaErrorCode =
  | "schema.registry.duplicate-identity"
  | "schema.registry.duplicate-schema"
  | "schema.registry.invalid-metadata";

/** Schema-domain error with a locally exhaustive code contract. */
export class SchemaError extends ArcError {
  override readonly code: SchemaErrorCode;

  constructor(message: string, code: SchemaErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "SchemaError";
    this.code = code;
  }
}

interface RegistryEntry {
  readonly schema: z.ZodType;
  readonly meta: KernelSchemaMeta;
}

const migrationPostures: ReadonlySet<MigrationPosture> = new Set([
  "strict-current",
  "backward-compatible",
]);

function compareIdentity(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const authoredSides: ReadonlySet<string> = new Set(["request", "editor-document"]);

function validateMetadata(meta: KernelSchemaMeta): void {
  if (meta.authored !== undefined && !authoredSides.has(meta.authored)) {
    throw new SchemaError(
      `Invalid authored side for ${meta.id}: ${JSON.stringify(meta.authored)}`,
      "schema.registry.invalid-metadata",
    );
  }
  if (!SlugSchema.safeParse(meta.id).success) {
    throw new SchemaError(
      `Invalid schema identity: ${JSON.stringify(meta.id)}`,
      "schema.registry.invalid-metadata",
    );
  }
  if (!Number.isSafeInteger(meta.version) || meta.version <= 0) {
    throw new SchemaError(
      `Invalid schema version for ${meta.id}: ${String(meta.version)}`,
      "schema.registry.invalid-metadata",
    );
  }
  if (!migrationPostures.has(meta.migrationPosture)) {
    throw new SchemaError(
      `Invalid migration posture for ${meta.id}: ${meta.migrationPosture}`,
      "schema.registry.invalid-metadata",
    );
  }
}

function projectRegistry(
  entries: ReadonlyMap<string, RegistryEntry>, options: KernelProjectionOptions,
): KernelJSONSchemaBundle {
  const projection = z.registry<{ id: string }>();
  for (const id of [...entries.keys()].sort(compareIdentity)) {
    const schema = entries.get(id)?.schema;
    if (schema !== undefined) projection.add(schema, { id });
  }
  const uri = options.uri ?? ((id: string) => `urn:arc:schema:${id}`);
  const bundle = z.toJSONSchema(projection, {
    target: "draft-2020-12",
    io: options.io,
    reused: "ref",
    uri,
  });
  // Zod hoists multiply referenced, unregistered subschemas into `__shared`. It emits refs to
  // that document but omits the document's own identity, so normalize it to the same bundle
  // contract as every registered root.
  if (bundle.schemas.__shared !== undefined && bundle.schemas.__shared.$id === undefined) {
    bundle.schemas.__shared.$id = uri("__shared");
  }
  return bundle;
}

/** Create an empty schema registry for downstream composition. */
export function createRegistry(): KernelRegistry {
  const nativeRegistry = z.registry<KernelSchemaMeta>();
  const entries = new Map<string, RegistryEntry>();

  return {
    register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T {
      const authored = meta.authored;
      const storedMeta: KernelSchemaMeta = Object.freeze({
        id: meta.id,
        version: meta.version,
        migrationPosture: meta.migrationPosture,
        ...(authored === undefined ? {} : { authored }),
      });
      validateMetadata(storedMeta);
      if (entries.has(storedMeta.id)) {
        throw new SchemaError(
          `Duplicate schema identity: ${storedMeta.id}`,
          "schema.registry.duplicate-identity",
        );
      }
      if (nativeRegistry.has(schema)) {
        const existingMeta = nativeRegistry.get(schema);
        throw new SchemaError(
          existingMeta === undefined
            ? "Schema instance already registered"
            : `Schema instance already registered as: ${existingMeta.id}`,
          "schema.registry.duplicate-schema",
        );
      }

      nativeRegistry.add(schema, storedMeta);
      entries.set(storedMeta.id, { schema, meta: storedMeta });
      return schema;
    },
    get(id: string): z.ZodType | undefined {
      return entries.get(id)?.schema;
    },
    meta(id: string): KernelSchemaMeta | undefined {
      return entries.get(id)?.meta;
    },
    ids(): readonly string[] {
      return [...entries.keys()].sort(compareIdentity);
    },
    toJSONSchema: (options) => projectRegistry(entries, options),
  };
}

/** Create a fresh registry preloaded with the kernel-owned vocabulary. */
export function createKernelRegistry(): KernelRegistry {
  const registry = createRegistry();
  registry.register(WorkUnitStateSchema, {
    id: "work-unit-state",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(WorkClassSchema, {
    id: "work-class",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(PrioritySchema, {
    id: "priority",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(RemoteEvidenceSchema, {
    id: "remote-evidence",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(RemoteFailureReasonSchema, {
    id: "remote-failure-reason",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(SlugSchema, {
    id: "slug",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
