/** Registered result contracts for schema discovery commands. */
import { z } from "zod";
import { SlugSchema, type KernelRegistry } from "../kernel/index.js";

const SchemaDescriptorSchema = z.strictObject({
  id: SlugSchema,
  version: z.number().int().positive(),
  migrationPosture: z.enum(["strict-current", "backward-compatible"]),
  editorDocument: z.strictObject({ path: z.string().min(1) }).nullable(),
});

export const SchemaListEnvelopeSchema = z.strictObject({
  status: z.literal("ok"), schemas: z.array(SchemaDescriptorSchema),
});
export const SchemaGetEnvelopeSchema = z.strictObject({
  status: z.literal("ok"), ...SchemaDescriptorSchema.shape, schema: z.record(z.string(), z.unknown()),
});
export const SchemaRefusalEnvelopeSchema = z.strictObject({
  status: z.literal("refused"), reason: z.literal("unknown-schema-id"), id: z.string(), remedy: z.literal("arc schema list"),
});

/**
 * Register discovery result contracts.
 * @param registry - Registry receiving the command envelopes.
 * @returns The supplied registry with all discovery result contracts registered.
 */
export function registerSchemaCommandSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of [
    ["schema-list-envelope", SchemaListEnvelopeSchema],
    ["schema-get-envelope", SchemaGetEnvelopeSchema],
    ["schema-refusal-envelope", SchemaRefusalEnvelopeSchema],
  ] as const) registry.register(schema, { id, version: 1, migrationPosture: "strict-current" });
  return registry;
}
