/** Environment record codecs retain validated own data properties without changing object prototypes. */
import { z } from "zod";
import { visitJsonSchemas } from "../kernel/schema/visit.js";

function recordProjection<Value extends z.ZodType>(record: z.ZodRecord<z.ZodString, Value>, io: "input" | "output") {
  const projection = z.toJSONSchema(record, { io, reused: "inline", cycles: "throw" });
  delete projection.$schema;
  visitJsonSchemas(projection, schema => {
    if (schema.$ref !== undefined || schema.$id !== undefined || schema.$defs !== undefined) {
      throw new Error("Environment record projection must be inline; remove schema identities or recursive values.");
    }
  });
  return projection;
}

/**
 * Preserve every string key, including __proto__, as an enumerable own data property.
 * The supplied record and its values must be synchronous, with no record-level refinements or key transformations.
 */
export function environmentRecord<Value extends z.ZodType>(
  record: z.ZodRecord<z.ZodString, Value>,
): z.ZodType<Record<string, z.output<Value>>, Record<string, z.input<Value>>> {
  function convert(value: unknown, context: z.core.ParsePayload, direction: "decode" | "encode") {
    const parsed = direction === "decode" ? record.safeParse(value)
      : z.safeEncode(record, value as z.output<typeof record>);
    if (!parsed.success) {
      context.issues.push(...parsed.error.issues.map(issue => ({ input: undefined, ...issue })));
      return z.NEVER;
    }
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "__proto__")) {
      const key = record.keyType.safeParse("__proto__");
      if (!key.success || key.data !== "__proto__") {
        context.issues.push({ code: "custom", path: ["__proto__"], input: "__proto__", message: "Invalid environment record key" });
        return z.NEVER;
      }
      const ownValue: unknown = Reflect.get(value, "__proto__");
      const own = direction === "decode" ? record.valueType.safeParse(ownValue)
        : z.safeEncode(record.valueType, ownValue as z.output<Value>);
      if (!own.success) {
        context.issues.push(...own.error.issues.map(issue => ({ input: undefined, ...issue, path: ["__proto__", ...issue.path] })));
        return z.NEVER;
      }
      Object.defineProperty(parsed.data, "__proto__", {
        value: own.data, enumerable: true, configurable: true, writable: true,
      });
    }
    return parsed.data;
  }
  return z.codec(
    z.unknown().meta(recordProjection(record, "input")),
    z.unknown().meta(recordProjection(record, "output")),
    { decode: (value, context) => convert(value, context, "decode"), encode: (value, context) => convert(value, context, "encode") },
  ) as z.ZodType<Record<string, z.output<Value>>, Record<string, z.input<Value>>>;
}
