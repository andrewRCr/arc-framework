/** CLI boundary for registered contract discovery. */
import { z } from "zod";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { SlugSchema, type KernelRegistry, type KernelSchemaMeta } from "../lib/kernel/index.js";
import { lookupKernelSchema } from "../lib/kernel/schema/generate.js";
import { resolveArcPath } from "../lib/layout/index.js";
import {
  SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../lib/schema-command/envelope.js";
import { createProductionSchemaRegistry } from "../production-schema-registry.js";

export interface SchemaListOptions { json?: boolean }
export interface SchemaHandlerDependencies {
  registry(): KernelRegistry;
  write(text: string): void;
  setExitCode(code: number): void;
}

export const SchemaListCommandInputSchema = z.strictObject({ json: z.boolean().optional() });
export const SchemaGetCommandInputSchema = z.strictObject({ id: z.string() });

/** Command-owned syntax registrations for contract discovery. */
export const schemaCommandInputRegistrations = [
  { commandPath: "schema list", schema: SchemaListCommandInputSchema, schemaFields: { "option.json": "json" } },
  { commandPath: "schema get", schema: SchemaGetCommandInputSchema, schemaFields: { "operand.id": "id" } },
] as const satisfies readonly CommandInputRegistration[];

/** Machine-output policy owned by the list adapter. */
export const schemaCommandInputPolicyDeclarations = [{
  commandPath: "schema list", aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}] satisfies readonly CommandInputDeclaration[];

function dependencies(overrides: Partial<SchemaHandlerDependencies>): SchemaHandlerDependencies {
  return {
    registry: createProductionSchemaRegistry,
    write: (text) => { process.stdout.write(text); },
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
}

function descriptor(meta: KernelSchemaMeta) {
  return {
    id: meta.id, version: meta.version, migrationPosture: meta.migrationPosture,
    editorDocument: meta.authored === "editor-document"
      ? { path: resolveArcPath({ kind: "editor-document", schema: SlugSchema.parse(meta.id) }) } : null,
  };
}

/**
 * Emit registered contract metadata without projecting schemas.
 * @param options - List output selection.
 * @param context - CLI interaction context.
 * @param overrides - Optional output and registry dependencies.
 */
export function handleSchemaList(
  options: SchemaListOptions, context?: InteractionContext, overrides: Partial<SchemaHandlerDependencies> = {},
): void {
  void context;
  const input = SchemaListCommandInputSchema.parse(options);
  const io = dependencies(overrides);
  const registry = io.registry();
  const schemas = registry.ids().map((id) => {
    const meta = registry.meta(id);
    if (meta === undefined) throw new Error(`Missing metadata for registered schema ${id}`);
    return descriptor(meta);
  });
  if (input.json) io.write(`${JSON.stringify(SchemaListEnvelopeSchema.parse({ status: "ok", schemas }))}\n`);
  else io.write(schemas.map(({ id, version, migrationPosture }) => `${id} ${version} ${migrationPosture}\n`).join(""));
  io.setExitCode(0);
}

/**
 * Emit one self-contained registered contract on its declared side.
 * @param id - Requested registry identity.
 * @param context - CLI interaction context.
 * @param overrides - Optional output and registry dependencies.
 */
export function handleSchemaGet(
  id: string, context?: InteractionContext, overrides: Partial<SchemaHandlerDependencies> = {},
): void {
  void context;
  const input = SchemaGetCommandInputSchema.parse({ id });
  const io = dependencies(overrides);
  const result = lookupKernelSchema(io.registry(), input.id);
  if (result.status === "unknown") {
    io.write(`${JSON.stringify(SchemaRefusalEnvelopeSchema.parse({
      status: "refused", reason: "unknown-schema-id", id: input.id, remedy: "arc schema list",
    }))}\n`);
    io.setExitCode(1);
    return;
  }
  io.write(`${JSON.stringify(SchemaGetEnvelopeSchema.parse({
    status: "ok", ...descriptor(result.meta), schema: result.schema,
  }))}\n`);
  io.setExitCode(0);
}
