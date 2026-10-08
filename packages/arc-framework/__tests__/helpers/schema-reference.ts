/** Resolve projected references so contract assertions do not depend on inlining. */

import type { KernelJSONSchema, KernelJSONSchemaBundle } from "../../src/lib/kernel/index.js";

/** Resolve one reference chain in a projected bundle. */
export function resolveSchemaReference(
  bundle: KernelJSONSchemaBundle, value: unknown, root?: KernelJSONSchema,
): KernelJSONSchema {
  if (typeof value !== "object" || value === null) throw new Error("Schema assertion selected no object document");
  const schema = value as KernelJSONSchema;
  if (schema.$ref === undefined) return schema;
  const [uri, fragment] = schema.$ref.split("#");
  const id = uri?.replace(/^urn:arc:schema:/u, "");
  let resolved: unknown = id === "" ? root : id === undefined ? undefined : bundle.schemas[id];
  for (const part of fragment?.split("/").slice(1) ?? []) {
    if (typeof resolved !== "object" || resolved === null) throw new Error(`Unresolved schema reference: ${schema.$ref}`);
    resolved = (resolved as Record<string, unknown>)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  if (typeof resolved !== "object" || resolved === null) throw new Error(`Unresolved schema reference: ${schema.$ref}`);
  return resolveSchemaReference(bundle, resolved, root);
}
