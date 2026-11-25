/** Safe source-capture conditions and actionable retry diagnostics. */
import { EnvironmentFileCaptureError } from "../environment-file.js";

/** A path-free observed capture condition that may be shown without arbitrary filesystem diagnostics. */
export class SourceCaptureError extends Error {}

/** What a missing entry means while freezing the caller's selection or verifying the captured copy. */
const ABSENT_ENTRY = {
  freeze: "a selected source entry is absent, as outside a sparse checkout or after a concurrent removal",
  verify: "a captured source entry is absent",
} as const;

/** A capture refusal that already carries its observed reason and repair guidance. */
class SourceCaptureFailure extends Error {}

/** Add repair guidance while retaining the original failure for diagnostics; an existing refusal passes through. */
export function sourceCaptureFailure(cause: unknown, action: "freeze" | "verify" = "freeze"): Error {
  if (cause instanceof SourceCaptureFailure) return cause;
  const reason = cause instanceof SourceCaptureError || cause instanceof EnvironmentFileCaptureError ? cause.message
    : "a source filesystem operation failed";
  return new SourceCaptureFailure(`Cannot ${action} source presentation: ${reason}. Repair unsupported entries or concurrent changes and retry; keep the check local or declare an explicit input for external data.`, { cause });
}

/** Run one operation on a selected or captured entry path, naming a missing entry rather than a generic failure. */
export async function sourceEntry<T>(action: "freeze" | "verify", operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (cause) {
    if (!absent(cause)) throw cause;
    throw new SourceCaptureError(ABSENT_ENTRY[action], { cause });
  }
}

function absent(cause: unknown): boolean {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
