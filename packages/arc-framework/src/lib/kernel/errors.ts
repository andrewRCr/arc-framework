/**
 * Extensible machine-readable error base and safe boundary adaptation.
 */

type LegacyArcErrorCode =
  | "GIT_MISSING"
  | "MANIFEST_MISSING"
  | "MANIFEST_INVALID"
  | "MERGE_FAILED"
  | "FILE_NOT_FOUND"
  | "REGISTRY_FETCH_FAILED"
  | "IDENTITY_MISSING"
  | "ALREADY_INSTALLED"
  | "INIT_IN_PROGRESS"
  | "NOT_INSTALLED"
  | "NO_ARC_INSTALLATION"
  | "NOT_IN_ARC_PROJECT"
  | "RECIPE_INVALID"
  | "MANIFEST_VERSION_UNSUPPORTED"
  | "ROLE_FORBIDDEN";

/** Legacy CLI codes plus lowercase dotted domain extensions. */
export type ArcErrorCode = LegacyArcErrorCode | `${Lowercase<string>}.${Lowercase<string>}`;

/** Base error carrying a stable machine-readable code. */
export class ArcError extends Error {
  readonly code: ArcErrorCode;

  constructor(message: string, code: ArcErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = "ArcError";
    this.code = code;
  }
}

interface ArcErrorFallback {
  readonly code: ArcErrorCode;
  readonly message: string;
}

/**
 * Convert an unknown thrown value to a stable ArcError without leaking unsafe details.
 *
 * @param value - Unknown boundary failure.
 * @param fallback - Stable caller-owned code and message.
 * @returns An existing ArcError by identity or a new safe fallback.
 */
export function toArcError(value: unknown, fallback: ArcErrorFallback): ArcError {
  if (value instanceof ArcError) return value;
  return value instanceof Error
    ? new ArcError(fallback.message, fallback.code, { cause: value })
    : new ArcError(fallback.message, fallback.code);
}
