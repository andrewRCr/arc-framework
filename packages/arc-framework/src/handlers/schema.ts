/** CLI boundary for registered contract discovery. */
import { z } from "zod";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { SlugSchema, type KernelRegistry, type KernelSchemaMeta } from "../lib/kernel/index.js";
import { lookupKernelSchema } from "../lib/kernel/schema/generate.js";
import { createGitExec } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import {
  nodeEditorDocumentsFs, writeEditorDocuments, type EditorDocumentsResult,
} from "../lib/schema-command/editor-documents.js";
import { ARC_PROJECT_ROOT_ERROR } from "./shared.js";
import { resolveArcPath } from "../lib/layout/index.js";
import {
  SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema, SchemaInstallEnvelopeSchema,
} from "../lib/schema-command/envelope.js";
import { createProductionSchemaRegistry } from "../production-schema-registry.js";

export interface SchemaListOptions { json?: boolean }
export interface SchemaHandlerDependencies {
  registry(): KernelRegistry;
  write(text: string): void;
  setExitCode(code: number): void;
}

export const SchemaListCommandInputSchema = z.strictObject({ json: z.boolean().optional() });
export const SchemaInstallCommandInputSchema = z.strictObject({ json: z.boolean().optional() });
export const SchemaGetCommandInputSchema = z.strictObject({ id: z.string() });

/** Command-owned syntax registrations for contract discovery. */
export const schemaCommandInputRegistrations = [
  { commandPath: "schema list", schema: SchemaListCommandInputSchema, schemaFields: { "option.json": "json" } },
  { commandPath: "schema install", schema: SchemaInstallCommandInputSchema, schemaFields: { "option.json": "json" } },
  { commandPath: "schema get", schema: SchemaGetCommandInputSchema, schemaFields: { "operand.id": "id" } },
] as const satisfies readonly CommandInputRegistration[];

/** Machine-output policy owned by the list and install adapters. */
export const schemaCommandInputPolicyDeclarations = ["schema list", "schema install"].map((commandPath): CommandInputDeclaration => ({
  commandPath, aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
})) satisfies readonly CommandInputDeclaration[];

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

export interface SchemaInstallOptions { json?: boolean }
export interface SchemaInstallDependencies extends SchemaHandlerDependencies {
  resolveRoot(): string | null;
  writeDocuments(root: string, registry: KernelRegistry): Promise<EditorDocumentsResult>;
  writeError(text: string): void;
}

/**
 * Install checkout editor documents and emit one validated result.
 * @param options - Installation output selection.
 * @param context - Per-invocation interaction policy.
 * @param overrides - Optional writer, project-resolution, and output dependencies.
 */
export async function handleSchemaInstall(
  options: SchemaInstallOptions, context?: InteractionContext, overrides: Partial<SchemaInstallDependencies> = {},
): Promise<void> {
  const input = SchemaInstallCommandInputSchema.parse(options);
  const io: SchemaInstallDependencies = {
    ...dependencies(overrides), resolveRoot: resolveArcRoot,
    writeDocuments: (root, registry) => writeEditorDocuments(
      root, createGitExec(context?.subprocess), nodeEditorDocumentsFs, registry,
    ),
    writeError: (text) => { process.stderr.write(text); }, ...overrides,
  };
  const root = io.resolveRoot();
  if (root === null) {
    emitInstallRefusal({ status: "refused", reason: "arc-project-root-unresolved" }, ARC_PROJECT_ROOT_ERROR, input.json, io);
    return;
  }
  const result = await io.writeDocuments(root, io.registry());
  if (!result.ok) {
    const remedy = `Correct the reported cause (${result.detail}) and rerun arc schema install.`;
    emitInstallRefusal({ status: "refused", reason: "editor-documents-unwritable",
      target: result.target, detail: result.detail, remedy,
      ...(result.path === undefined ? {} : { path: result.path }),
    }, `${result.detail}\n${remedy}`, input.json, io);
    return;
  }
  const envelope = SchemaInstallEnvelopeSchema.parse({ status: "ok", documents: result.documents });
  io.write(input.json ? `${JSON.stringify(envelope)}\n` : envelope.documents.map((path) => `${path}\n`).join(""));
  io.setExitCode(0);
}

function emitInstallRefusal(
  value: unknown, message: string, json: boolean | undefined, io: SchemaInstallDependencies,
): void {
  const envelope = SchemaRefusalEnvelopeSchema.parse(value);
  if (json) io.write(`${JSON.stringify(envelope)}\n`);
  else io.writeError(`${message}\n`);
  io.setExitCode(1);
}
