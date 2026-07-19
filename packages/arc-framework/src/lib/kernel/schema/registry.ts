/**
 * Versioned schema discovery and deterministic JSON Schema projection.
 */

import { z } from "zod";

import { SlugSchema } from "./slug.js";
import {
  PrioritySchema,
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
}

/** One JSON Schema emitted by the kernel projection. */
export type KernelJSONSchema = z.core.JSONSchema.BaseSchema;

/** Deterministic bundle keyed by stable schema identity. */
export interface KernelJSONSchemaBundle {
  readonly schemas: Record<string, KernelJSONSchema>;
}

/** Public discovery and projection contract for kernel and subsystem schemas. */
export interface KernelRegistry {
  register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T;
  get(id: string): z.ZodType | undefined;
  meta(id: string): KernelSchemaMeta | undefined;
  ids(): readonly string[];
  toJSONSchema(options?: { readonly uri?: (id: string) => string }): KernelJSONSchemaBundle;
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

function validateMetadata(meta: KernelSchemaMeta): void {
  if (!SlugSchema.safeParse(meta.id).success) {
    throw new Error(`Invalid schema identity: ${JSON.stringify(meta.id)}`);
  }
  if (!Number.isSafeInteger(meta.version) || meta.version <= 0) {
    throw new Error(`Invalid schema version for ${meta.id}: ${String(meta.version)}`);
  }
  if (!migrationPostures.has(meta.migrationPosture)) {
    throw new Error(`Invalid migration posture for ${meta.id}: ${meta.migrationPosture}`);
  }
}

/** Create an empty schema registry for downstream composition. */
export function createRegistry(): KernelRegistry {
  const nativeRegistry = z.registry<KernelSchemaMeta>();
  const entries = new Map<string, RegistryEntry>();
  const schemaIdentities = new WeakMap<z.ZodType, string>();

  return {
    register<T extends z.ZodType>(schema: T, meta: KernelSchemaMeta): T {
      validateMetadata(meta);
      if (entries.has(meta.id)) throw new Error(`Duplicate schema identity: ${meta.id}`);
      const existingIdentity = schemaIdentities.get(schema);
      if (existingIdentity !== undefined) {
        throw new Error(`Schema instance already registered as: ${existingIdentity}`);
      }

      const storedMeta = Object.freeze({ ...meta });
      nativeRegistry.add(schema, storedMeta);
      entries.set(storedMeta.id, { schema, meta: storedMeta });
      schemaIdentities.set(schema, storedMeta.id);
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
    toJSONSchema(options): KernelJSONSchemaBundle {
      const projection = z.registry<{ id: string }>();
      for (const id of [...entries.keys()].sort(compareIdentity)) {
        const schema = entries.get(id)?.schema;
        if (schema !== undefined) projection.add(schema, { id });
      }
      return z.toJSONSchema(projection, {
        target: "draft-2020-12",
        uri: options?.uri ?? ((id) => `${id}.schema.json`),
      });
    },
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
  registry.register(SlugSchema, {
    id: "slug",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
