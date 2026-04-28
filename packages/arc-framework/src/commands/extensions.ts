/**
 * Extensions subcommand public surface.
 *
 * Keeps a stable `commands/extensions.ts` import path for handlers and tests.
 */

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
