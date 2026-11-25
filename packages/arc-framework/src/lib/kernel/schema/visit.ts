/** Traverse JSON Schema positions while leaving instance-valued metadata intact. */
import type { KernelJSONSchema } from "./registry.js";

const schemaMapKeywords = new Set(["$defs", "properties", "patternProperties", "dependentSchemas"]);
const schemaValueKeywords = new Set([
  "items", "prefixItems", "contains", "additionalItems", "unevaluatedItems", "additionalProperties",
  "unevaluatedProperties", "propertyNames", "if", "then", "else", "allOf", "anyOf", "oneOf", "not", "contentSchema",
]);

/** Visit each schema object once; defaults, examples, enums and constants remain instance data. */
export function visitJsonSchemas(value: unknown, visit: (schema: KernelJSONSchema) => void): void {
  const seen = new Set<object>();
  function walk(nested: unknown): void {
    if (typeof nested !== "object" || nested === null || seen.has(nested)) return;
    seen.add(nested);
    if (Array.isArray(nested)) {
      for (const member of nested) walk(member);
      return;
    }
    const record = nested as Record<string, unknown>;
    visit(record);
    for (const [keyword, child] of Object.entries(record)) {
      if (schemaValueKeywords.has(keyword)) walk(child);
      else if (schemaMapKeywords.has(keyword) && typeof child === "object" && child !== null) {
        for (const schema of Object.values(child)) walk(schema);
      }
    }
  }
  walk(value);
}
