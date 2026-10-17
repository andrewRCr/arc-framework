/** Canonical syntax and interaction declarations for explicit ref-store commands. */

import { z } from "zod";
import { StoreConflictInputSchema, StoreMigrateInputSchema, StoreRemoteInputSchema } from "../lib/store/commands.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { storeOwnStatePromptSite } from "./store-remote.js";

/** CLI migration inputs retain the engine's validated fields and add output selection. */
export const StoreMigrateCommandInputSchema = StoreMigrateInputSchema.extend({ json: z.boolean().optional() });
/** CLI role settings retain the engine's validated fields and add output selection. */
export const StoreRemoteCommandInputSchema = StoreRemoteInputSchema.extend({ json: z.boolean().optional() });

/** Exact conflict operands add only output selection to the engine input. */
export const StoreConflictCommandInputSchema = StoreConflictInputSchema.extend({ json: z.boolean().optional() });

/** Every supplied operand and option belongs to the command's canonical input. */
export const storeCommandInputRegistrations = [
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
export const storeCommandInputPolicyDeclarations = ["store conflict", "store migrate", "store remote"].map((commandPath): CommandInputDeclaration => ({
  commandPath, aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] }, mutationBoundary: "output selection", subprocess: "none",
  }), ...commandPath === "store remote" ? [storeOwnStatePromptSite] : []],
}));
