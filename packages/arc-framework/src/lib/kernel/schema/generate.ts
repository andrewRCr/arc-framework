/** Deterministic registry projection and self-contained schema discovery. */

import {
  createKernelRegistry,
  type KernelJSONSchema,
  type KernelJSONSchemaBundle,
  type KernelRegistry,
  type KernelSchemaMeta,
} from "./registry.js";

/**
 * Project one explicit side, defaulting to the fresh built-in kernel vocabulary.
 * @param io - Side of each contract to project
 * @param registry - Registered roots to compose
 * @returns The selected side's deterministic bundle
 */
export function projectKernelSchemas(
  io: "input" | "output", registry: KernelRegistry = createKernelRegistry(),
): KernelJSONSchemaBundle {
  return registry.toJSONSchema({ io });
}

interface FoldContext {
  readonly bundle: KernelJSONSchemaBundle;
  readonly definitions: NonNullable<KernelJSONSchema["$defs"]>;
  readonly folded: Map<string, string>;
}

function copySchema<T>(value: T): T {
  // A JSON round trip breaks Zod's shared object identities before reference rewriting.
  return JSON.parse(JSON.stringify(value)) as T;
}

function foldReference(reference: string, context: FoldContext): string {
  const existing = context.folded.get(reference);
  if (existing !== undefined) return existing;
  const registered = /^urn:arc:schema:([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(reference);
  const shared = /^urn:arc:schema:__shared#\/\$defs\/([a-zA-Z0-9_-]+)$/u.exec(reference);
  const id = registered?.[1];
  const name = shared?.[1];
  const key = id ?? (name === undefined ? undefined : `__${name}`);
  if (key === undefined) throw new Error(`Unsupported schema reference: ${reference}`);
  const source = id === undefined
    ? context.bundle.schemas.__shared?.$defs?.[name ?? ""]
    : context.bundle.schemas[id];
  if (source === undefined) throw new Error(`Unavailable schema reference: ${reference}`);
  if (Object.hasOwn(context.definitions, key)) throw new Error(`Schema fold key collision: ${key}`);
  const definition = copySchema(source);
  if (typeof definition === "object") {
    delete definition.$id;
    delete definition.$schema;
  }
  context.folded.set(reference, key);
  context.definitions[key] = definition;
  rewriteReferences(definition, context);
  return key;
}

function rewriteReferences(value: unknown, context: FoldContext): void {
  if (Array.isArray(value)) {
    for (const nested of value) rewriteReferences(nested, context);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record["$ref"] === "string") {
    record["$ref"] = `#/$defs/${foldReference(record["$ref"], context)}`;
  }
  for (const nested of Object.values(record)) rewriteReferences(nested, context);
}

/**
 * Fold one root from a projected side into a self-contained document.
 * @param bundle - Projected documents on one explicit side
 * @param id - Registered root identity
 * @returns A document retaining its root identity and only reachable dependencies
 */
export function foldKernelSchemaClosure(bundle: KernelJSONSchemaBundle, id: string): KernelJSONSchema {
  const source = bundle.schemas[id];
  if (source === undefined) throw new Error(`Registered schema unavailable: ${id}`);
  const root = copySchema(source);
  const definitions = root.$defs ?? {};
  delete root.$defs;
  const context: FoldContext = { bundle, definitions, folded: new Map() };
  for (const definition of Object.values(definitions)) rewriteReferences(definition, context);
  rewriteReferences(root, context);
  if (Object.keys(definitions).length > 0) root.$defs = definitions;
  return root;
}

/**
 * Project a registered root on its declared side into one self-contained document.
 * @param registry - Registry containing the selected root and its dependencies
 * @param rootId - Stable registered schema identity
 * @returns The input document for an authored root, otherwise its output document
 */
export function projectKernelSchemaClosure(registry: KernelRegistry, rootId: string): KernelJSONSchema {
  const meta = registry.meta(rootId);
  if (meta === undefined) throw new Error(`Registered schema unavailable: ${rootId}`);
  return foldKernelSchemaClosure(projectKernelSchemas(meta.authored === undefined ? "output" : "input", registry), rootId);
}

/** Serialize a schema bundle with stable indentation and one terminal newline. */
export function serializeKernelSchemaBundle(bundle: KernelJSONSchemaBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/** Discovery result for one registered contract. */
export type KernelSchemaLookup =
  | { readonly status: "found"; readonly meta: KernelSchemaMeta; readonly schema: KernelJSONSchema }
  | { readonly status: "unknown" };

/**
 * Look up one registered contract and its canonical document.
 * @param registry - Production or subsystem registry to query
 * @param id - Requested registered identity
 * @returns Metadata and document, or an unknown-identity result
 */
export function lookupKernelSchema(registry: KernelRegistry, id: string): KernelSchemaLookup {
  const meta = registry.meta(id);
  if (meta === undefined) return { status: "unknown" };
  return { status: "found", meta, schema: projectKernelSchemaClosure(registry, id) };
}
