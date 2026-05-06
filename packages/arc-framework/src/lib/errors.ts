/**
 * Shared error handling utilities.
 *
 * Provides structured error types for consistent error reporting across
 * all CLI commands. ArcError adds a machine-readable code; UserFacingError
 * adds human-readable context fields for terminal output.
 *
 * @module
 */

/** Machine-readable error codes for programmatic handling. */
export type ArcErrorCode =
  | "GIT_MISSING"
  | "MANIFEST_MISSING"
  | "MANIFEST_INVALID"
  | "MERGE_FAILED"
  | "FILE_NOT_FOUND"
  | "REGISTRY_FETCH_FAILED"
  | "IDENTITY_MISSING"
  | "ALREADY_INSTALLED"
  | "NOT_INSTALLED"
  | "NO_ARC_INSTALLATION"
  | "NOT_IN_ARC_PROJECT"
  | "RECIPE_INVALID"
  | "MANIFEST_VERSION_UNSUPPORTED"
  | "ROLE_FORBIDDEN";

/**
 * Base error class for all ARC CLI errors.
 *
 * Extends Error with a `code` property for programmatic handling.
 */
export class ArcError extends Error {
  readonly code: ArcErrorCode;

  constructor(message: string, code: ArcErrorCode) {
    super(message);
    this.name = "ArcError";
    this.code = code;
  }
}

/** Options for constructing a UserFacingError. */
export interface UserFacingErrorOptions {
  code: ArcErrorCode;
  /** What went wrong — also used as the Error message. */
  whatHappened: string;
  /** Why it happened — merged with whatHappened as "X — Y." in formatted output. */
  why: string;
  /**
   * Actionable remediation for the user. Rendered as-is — author the full
   * phrasing including any lead-in (e.g., "To fix this, run:\n    arc init").
   */
  whatToDo: string;
}

/**
 * User-facing error with structured context for terminal display.
 *
 * Provides three fields that help users understand and resolve the problem:
 * - `whatHappened` — what went wrong (also used as the Error message)
 * - `why` — why it happened
 * - `whatToDo` — how to fix it
 */
export class UserFacingError extends ArcError {
  readonly whatHappened: string;
  readonly why: string;
  readonly whatToDo: string;

  constructor(options: UserFacingErrorOptions) {
    super(options.whatHappened, options.code);
    this.name = "UserFacingError";
    this.whatHappened = options.whatHappened;
    this.why = options.why;
    this.whatToDo = options.whatToDo;
  }
}

/**
 * Formats an error for terminal output.
 *
 * Follows idiomatic CLI conventions (rustc, pnpm, cargo):
 * - UserFacingError: code on first line, merged what+why summary, separated fix
 * - ArcError: code + message on one line
 * - Other errors: message only
 *
 * @param err - The error to format
 * @returns Formatted string suitable for terminal display
 */
export function formatError(err: Error): string {
  if (err instanceof UserFacingError) {
    const summary = `${err.whatHappened} — ${ensureTrailingPeriod(err.why)}`;
    return [
      `✖ ${err.code}`,
      `  ${summary}`,
      "",
      `  ${err.whatToDo}`,
    ].join("\n");
  }

  if (err instanceof ArcError) {
    return `✖ ${err.code}: ${err.message}`;
  }

  return `✖ ${err.message}`;
}

/**
 * Create a MANIFEST_MISSING error for a command that requires an existing installation.
 *
 * @param command - The command name for the error message (e.g., "health", "diff", "update")
 * @returns A UserFacingError with consistent messaging
 */
export function manifestMissingError(command: string): UserFacingError {
  return new UserFacingError({
    code: "MANIFEST_MISSING",
    whatHappened: "No ARC manifest found",
    why: `The ${command} command requires an existing ARC installation with a manifest file.`,
    whatToDo: "Run 'arc init' first to install the ARC framework.",
  });
}

/**
 * Format an unexpected/unhandled error for clean terminal output.
 *
 * Used by the global error boundary to ensure no raw stack traces reach
 * the user. Delegates to `formatError` for known error types; for unknown
 * errors, returns a clean one-line message.
 *
 * @param err - The caught value (may not be an Error)
 * @returns Formatted string suitable for terminal display
 */
export function formatUnexpectedError(err: unknown): string {
  if (err instanceof Error) {
    return formatError(err);
  }
  return `✖ ${String(err)}`;
}

/** Ensures a string ends with a sentence-terminal punctuation mark. */
function ensureTrailingPeriod(text: string): string {
  if (/[.!?]$/.test(text)) return text;
  return `${text}.`;
}
