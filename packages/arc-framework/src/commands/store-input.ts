/** Canonical syntax and interaction declarations for explicit ref-store commands. */

import { z } from "zod";
import { StoreConflictInputSchema, StoreMigrateInputSchema, StoreRemoteInputSchema } from "../lib/store/commands.js";
import { declareCliOptionSite, declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { storeOwnStatePromptSite } from "./store-remote.js";
import { storeFollowPromptSite } from "./store-migrate.js";

/** CLI migration inputs retain the engine's validated fields and add output selection. */
export const StoreMigrateCommandInputSchema = StoreMigrateInputSchema.extend({ json: z.boolean().optional() });
/** CLI role settings retain the engine's validated fields and add output selection. */
export const StoreRemoteCommandInputSchema = StoreRemoteInputSchema.extend({ json: z.boolean().optional() });

/** Exact conflict operands add only output selection to the engine input. */
export const StoreConflictCommandInputSchema = StoreConflictInputSchema.extend({ json: z.boolean().optional() });

/** A request file or stdin marker is mutually exclusive with schema discovery. */
export const StoreReviewRootRepairCommandInputSchema = z.strictObject({ file: z.string().trim().min(1).optional(),
  schema: z.literal(true).optional() }).refine(input => (input.file === undefined) !== (input.schema === undefined),
"Provide exactly one JSON request file, - for stdin, or --schema.");

/** Every supplied operand and option belongs to the command's canonical input. */
export const storeCommandInputRegistrations = [
  { commandPath: "store repair-review-roots", schema: StoreReviewRootRepairCommandInputSchema,
    schemaFields: { "operand.file": "file", "option.schema": "schema" } },
  { commandPath: "store conflict", schema: StoreConflictCommandInputSchema, schemaFields: {
    "operand.uid": "uid", "operand.kind": "kind", "operand.id": "id", "option.discard": "discard", "option.json": "json",
  } },
  { commandPath: "store migrate", schema: StoreMigrateCommandInputSchema, schemaFields: {
    "option.to": "to", "option.trial": "trial", "option.leave-source": "leaveSource", "option.import": "import", "option.json": "json",
  } },
  { commandPath: "store remote", schema: StoreRemoteCommandInputSchema, schemaFields: {
    "operand.remote": "remote", "operand.role": "role", "option.own-state": "ownState", "option.json": "json",
  } },
] as const satisfies readonly CommandInputRegistration[];

/** Machine output forbids terminal acquisition; publication has a purpose-named authority flag. */
export const storeCommandInputPolicyDeclarations: readonly CommandInputDeclaration[] = [...["store conflict", "store migrate", "store remote"].map((commandPath): CommandInputDeclaration => ({
  commandPath, aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] }, mutationBoundary: "output selection", subprocess: "none",
  }), ...commandPath === "store remote" ? [storeOwnStatePromptSite] : [],
  ...commandPath === "store migrate" ? [storeFollowPromptSite] : []],
})), { commandPath: "store repair-review-roots", aliases: [], sites: [declareInteractionSite(
  { file: "commands/store-review-root-repair.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
  { acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
    mutationBoundary: "root-repair request read", subprocess: "explicit-stdin" },
)] }];
