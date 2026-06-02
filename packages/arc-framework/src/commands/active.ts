/**
 * Active subcommand public surface.
 *
 * Stable `commands/active.ts` import path for handlers and tests.
 */

export {
  runActiveStatus,
  runActiveSessionInitStatus,
} from "./active/status.js";
export {
  runActiveRoster,
  type ActiveRosterOptions,
  type ActiveRosterResult,
} from "./active/roster.js";
export {
  runActiveInFlight,
  type ActiveInFlightOptions,
  type ActiveInFlightResult,
} from "./active/in-flight.js";
export {
  buildActiveStatusSummary,
  buildActiveSessionInitSummary,
} from "./active/format.js";
export type {
  ActiveLayout,
  ActiveResult,
  ActiveSessionInitOptions,
  ActiveSessionInitResolution,
  ActiveSessionInitResult,
  ActiveStatusOptions,
  ActiveStatusResult,
  MetaFileCandidate,
} from "./active/types.js";
