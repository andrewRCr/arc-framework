/**
 * Config subcommand public surface.
 *
 * Stable `commands/config.ts` import path for handlers and tests.
 */

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
  ConfigSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./config/types.js";
