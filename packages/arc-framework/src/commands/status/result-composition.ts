/** Typed Result composition and the sole adapter to public status Probe slots. */

import {
  ArcError,
  type Result,
} from "../../lib/kernel/index.js";
import type { Probe } from "./types.js";

const IDENTITY_MISSING_MESSAGE =
  "User probe skipped: `arc.identity` is not configured in git config.";

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Mandatory identity short-circuit for an identity-scoped status slot. */
export class SessionIdentityMissingError extends ArcError {
  readonly slot: string;

  constructor(slot: string) {
    super(IDENTITY_MISSING_MESSAGE, "session.identity-missing");
    this.name = "SessionIdentityMissingError";
    this.slot = slot;
  }
}

/** Failure thrown or rejected by one independently fallible probe. */
export class SessionProbeError extends ArcError {
  readonly slot: string;
  readonly originalCause: unknown;

  constructor(slot: string, cause: unknown) {
    super(causeMessage(cause), "session.probe-failed", cause instanceof Error ? { cause } : undefined);
    this.name = "SessionProbeError";
    this.slot = slot;
    this.originalCause = cause;
  }
}

/** Failure in an intentionally fallible synchronous composition step. */
export class SessionCompositionError extends ArcError {
  readonly operation: string;
  readonly slot: string;
  readonly originalCause: unknown;

  constructor(operation: string, slot: string, cause: unknown) {
    super(causeMessage(cause), "session.composition-failed", cause instanceof Error ? { cause } : undefined);
    this.name = "SessionCompositionError";
    this.operation = operation;
    this.slot = slot;
    this.originalCause = cause;
  }
}

/** Exhaustive internal error channel for status Result composition. */
export type SessionStatusError =
  | SessionIdentityMissingError
  | SessionProbeError
  | SessionCompositionError;

/**
 * Adapt one resolved internal Result to the stable public Probe wire union.
 *
 * @param result - Independently resolved status Result
 * @returns Exact legacy success/error probe branch
 */
export function toProbe<Value>(result: Result<Value, SessionStatusError>): Probe<Value> {
  if (result.isOk()) return { ok: true, value: result.value };
  return {
    ok: false,
    error: {
      kind: result.error instanceof SessionIdentityMissingError ? "identity-missing" : "runtime",
      message: result.error.message,
    },
  };
}
