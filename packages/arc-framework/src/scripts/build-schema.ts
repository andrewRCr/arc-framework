/** Isolated native entry for production schema generation. */
import { writeKernelSchemaArtifact } from "../lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "../production-schema-registry.js";

/**
 * Generate the runtime schema from the production registry.
 * @param outDir - Owned compiler output directory
 * @returns Resolves after atomic schema publication
 */
export async function generateRuntimeSchema(outDir: string): Promise<void> {
  await writeKernelSchemaArtifact({ outDir, registry: createProductionSchemaRegistry() });
}
