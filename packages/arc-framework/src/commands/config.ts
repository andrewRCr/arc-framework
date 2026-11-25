/**
 * Config subcommand public surface.
 *
 * Stable `commands/config.ts` import path for handlers and tests.
 */

import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

/** Explicit file selection accepted by `arc config validate`. */
export const ConfigValidateCommandInputSchema = z.object({
  file: z.string().min(1).optional(),
}).strict();

/** Registry contribution owned by configuration validation. */
export const configValidateCommandInputRegistration = {
  commandPath: "config validate",
  schema: ConfigValidateCommandInputSchema,
  schemaFields: { "option.file": "file" },
} satisfies CommandInputRegistration;

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
export { validateConfigFile } from "./config/validate.js";
export {
  buildConfigStatusSummary,
  buildConfigSessionInitSummary,
} from "./config/format.js";
export type {
  ConfigValidationResult,
  ValidateConfigFileOptions,
} from "./config/validate.js";
export type {
  ConfigResult,
  ConfigSessionInitOptions,
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./config/types.js";
