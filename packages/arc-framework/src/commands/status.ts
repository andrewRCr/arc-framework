/**
 * Status subcommand public surface.
 *
 * Stable `commands/status.ts` import path for handlers and tests.
 */

export {
  runStatus,
  runSessionInitStatus,
  runSessionHandoffStatus,
} from "./status/run.js";
export {
  buildStatusSummary,
  buildSessionInitStatusSummary,
} from "./status/format.js";
export type {
  HandoffAutonomy,
  Probe,
  ProbeError,
  RunSessionHandoffStatusOptions,
  RunSessionInitStatusOptions,
  RunStatusOptions,
  SessionHandoffProbes,
  SessionHandoffResult,
  SessionInitProbeResult,
  SessionInitProbes,
  StatusIdentity,
  StatusProbes,
  StatusResult,
} from "./status/types.js";
