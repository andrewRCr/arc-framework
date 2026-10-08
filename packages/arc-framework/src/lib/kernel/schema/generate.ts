/**
 * Deterministic registry projection and dependency-complete schema discovery.
 */

import {
  createKernelRegistry,
  type KernelJSONSchemaBundle,
  type KernelRegistry,
} from "./registry.js";

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
