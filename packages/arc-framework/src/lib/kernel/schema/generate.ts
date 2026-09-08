/**
 * Deterministic projection and atomic publication of the kernel schema bundle.
 */

import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  createKernelRegistry,
  type KernelJSONSchemaBundle,
  type KernelRegistry,
} from "./registry.js";

/** Injectable filesystem boundary for atomic schema artifact publication. */
export interface SchemaArtifactFileSystem {
  readonly mkdir: (path: string, options: { readonly recursive: true }) => Promise<string | undefined>;
  readonly writeFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
  readonly rename: (temporaryPath: string, destinationPath: string) => Promise<void>;
  readonly unlink: (path: string) => Promise<void>;
}

interface WriteKernelSchemaArtifactOptions {
  readonly outDir: string;
  readonly registry?: KernelRegistry;
  readonly fileSystem?: SchemaArtifactFileSystem;
}

const defaultFileSystem: SchemaArtifactFileSystem = { mkdir, writeFile, rename, unlink };

/** Project a registry, defaulting to the fresh built-in kernel vocabulary. */
export function projectKernelSchemas(registry: KernelRegistry = createKernelRegistry()): KernelJSONSchemaBundle {
  return registry.toJSONSchema();
}

function collectReferencedSchemaUris(value: unknown, references: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedSchemaUris(item, references);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  const reference = record["$ref"];
  if (typeof reference === "string") {
    const [documentUri] = reference.split("#", 1);
    if (documentUri !== undefined && documentUri.length > 0) references.add(documentUri);
  }
  for (const nested of Object.values(record)) collectReferencedSchemaUris(nested, references);
}

/**
 * Project one registered root plus only the schema documents reachable from its references.
 *
 * @param registry - Registry containing the selected root and its dependencies.
 * @param rootId - Stable registered schema identity, without the generated URI suffix.
 * @returns A deterministic, dependency-complete schema bundle rooted at `rootId`.
 */
export function projectKernelSchemaClosure(
  registry: KernelRegistry,
  rootId: string,
): KernelJSONSchemaBundle {
  const bundle = projectKernelSchemas(registry);
  const schemaKeyByUri = new Map<string, string>();
  for (const [schemaKey, schema] of Object.entries(bundle.schemas)) {
    if (typeof schema.$id === "string") schemaKeyByUri.set(schema.$id, schemaKey);
  }

  const included = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const schemaKey = pending.pop();
    if (schemaKey === undefined || included.has(schemaKey)) continue;
    const schema = bundle.schemas[schemaKey];
    if (schema === undefined) throw new Error(`Registered schema unavailable: ${schemaKey}`);
    included.add(schemaKey);

    const references = new Set<string>();
    collectReferencedSchemaUris(schema, references);
    for (const reference of references) {
      const dependencyKey = schemaKeyByUri.get(reference);
      if (dependencyKey === undefined) {
        throw new Error(`Schema ${schemaKey} references unavailable document: ${reference}`);
      }
      if (!included.has(dependencyKey)) pending.push(dependencyKey);
    }
  }

  return {
    schemas: Object.fromEntries(
      Object.entries(bundle.schemas).filter(([schemaKey]) => included.has(schemaKey)),
    ),
  };
}

/** Serialize a schema bundle with stable indentation and one terminal newline. */
export function serializeKernelSchemaBundle(bundle: KernelJSONSchemaBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/**
 * Atomically publish `schemas/kernel.json` beneath a build output directory.
 *
 * @param options - Output directory plus optional registry and filesystem dependencies.
 * @returns The final artifact path.
 */
export async function writeKernelSchemaArtifact(options: WriteKernelSchemaArtifactOptions): Promise<string> {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const schemaDir = join(options.outDir, "schemas");
  const finalPath = join(schemaDir, "kernel.json");
  const temporaryPath = join(schemaDir, `.kernel.json.${String(process.pid)}.${randomUUID()}.tmp`);
  const bytes = serializeKernelSchemaBundle(projectKernelSchemas(options.registry));

  await fileSystem.mkdir(schemaDir, { recursive: true });
  try {
    await fileSystem.writeFile(temporaryPath, bytes, "utf8");
    await fileSystem.rename(temporaryPath, finalPath);
  } catch (error) {
    await fileSystem.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  return finalPath;
}
