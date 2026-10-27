/** Safe source-capture conditions and actionable retry diagnostics. */
import { EnvironmentFileCaptureError } from "../environment-file.js";

/** A path-free observed capture condition that may be shown without arbitrary filesystem diagnostics. */
export class SourceCaptureError extends Error {}

/** Add repair guidance while retaining the original failure for diagnostics. */
export function sourceCaptureFailure(cause: unknown, action: "freeze" | "verify" = "freeze"): Error {
  const reason = cause instanceof SourceCaptureError || cause instanceof EnvironmentFileCaptureError
    ? cause.message : "a source filesystem operation failed";
  return new Error(`Cannot ${action} source presentation: ${reason}. Repair unsupported entries or concurrent changes and retry; keep the check local or declare an explicit input for external data.`, { cause });
}
