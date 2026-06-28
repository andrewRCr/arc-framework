/**
 * Status subcommand public surface.
 *
 * Stable `commands/status.ts` import path for handlers and tests.
 */

export {
  runRecoverStatus,
  runStatus,
  runSessionInitStatus,
  runSessionHandoffStatus,
} from "./status/run.js";
export {
  buildStatusSummary,
  buildSessionInitStatusSummary,
} from "./status/format.js";
export type {
  HandoffSyncInterlock,
  Probe,
  ProbeError,
  RunRecoverStatusOptions,
  RunSessionHandoffStatusOptions,
  RunSessionInitStatusOptions,
  RunStatusOptions,
  SessionRecoverProbeResult,
  SessionRecoverProbes,
  SessionRecoverWorktreeValue,
  SessionHandoffProbes,
  SessionHandoffResult,
  SessionInitProbeResult,
  SessionInitProbes,
  StatusIdentity,
  StatusProbes,
  StatusResult,
} from "./status/types.js";
