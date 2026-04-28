/**
 * Status subcommand public surface.
 *
 * Stable `commands/status.ts` import path for handlers and tests.
 */

export { runStatus, runSessionInitStatus } from "./status/run.js";
export {
  buildStatusSummary,
  buildSessionInitStatusSummary,
} from "./status/format.js";
export type {
  Probe,
  ProbeError,
  RunSessionInitStatusOptions,
  RunStatusOptions,
  SessionInitProbeResult,
  SessionInitProbes,
  StatusIdentity,
  StatusProbes,
  StatusResult,
} from "./status/types.js";
