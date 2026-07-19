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
