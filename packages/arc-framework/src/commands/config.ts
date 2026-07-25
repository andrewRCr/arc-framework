/**
 * Config subcommand public surface.
 *
 * Stable `commands/config.ts` import path for handlers and tests.
 */

import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";

/** Machine-output policies owned by the config status adapter. */
export const configCommandInputPolicyDeclarations = [{
  commandPath: "config status",
  aliases: [],
  sites: (["json", "session-init"] as const).map((option) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })),
}] satisfies readonly CommandInputDeclaration[];

export {
  runConfigStatus,
  runConfigSessionInitStatus,
} from "./config/status.js";
export {
  buildConfigStatusSummary,
  buildConfigSessionInitSummary,
} from "./config/format.js";
export type {
  ConfigResult,
  ConfigSessionInitOptions,
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./config/types.js";
