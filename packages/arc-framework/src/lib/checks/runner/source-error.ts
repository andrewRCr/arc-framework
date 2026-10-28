/** Safe source-capture conditions and actionable retry diagnostics. */
import { EnvironmentFileCaptureError } from "../environment-file.js";

/** A path-free observed capture condition that may be shown without arbitrary filesystem diagnostics. */
export class SourceCaptureError extends Error {}

/** A capture refusal that already carries its observed reason and repair guidance. */
class SourceCaptureFailure extends Error {}

/** Add repair guidance while retaining the original failure for diagnostics; an existing refusal passes through. */
export function sourceCaptureFailure(cause: unknown, action: "freeze" | "verify" = "freeze"): Error {
  if (cause instanceof SourceCaptureFailure) return cause;
  const reason = cause instanceof SourceCaptureError || cause instanceof EnvironmentFileCaptureError
    ? cause.message : "a source filesystem operation failed";
  return new SourceCaptureFailure(`Cannot ${action} source presentation: ${reason}. Repair unsupported entries or concurrent changes and retry; keep the check local or declare an explicit input for external data.`, { cause });
}
