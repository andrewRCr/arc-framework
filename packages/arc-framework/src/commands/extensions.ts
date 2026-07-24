/**
 * Extensions subcommand public surface.
 *
 * Keeps a stable `commands/extensions.ts` import path for handlers and tests.
 */

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";

/** Machine-output policies owned by the extensions status adapter. */
export const extensionsCommandInputPolicyDeclarations = [{
  commandPath: "extensions status",
  aliases: [],
  sites: (["json", "session-init"] as const).map((option) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })),
}] satisfies readonly CommandInputDeclaration[];

export {
  runExtensionsStatus,
  runExtensionsSessionInitStatus,
} from "./extensions/status.js";
export {
  buildExtensionsStatusSummary,
  buildExtensionsSessionInitSummary,
} from "./extensions/format.js";
export type {
  ExtensionOrphanEntry,
  ExtensionSummary,
  ExtensionsResult,
  ExtensionsSessionInitOptions,
  ExtensionsSessionInitResult,
  ExtensionsStatusOptions,
  ExtensionsStatusResult,
} from "./extensions/types.js";
