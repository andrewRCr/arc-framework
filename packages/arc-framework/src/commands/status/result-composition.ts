/** Typed Result composition and the sole adapter to public status Probe slots. */

import {
  ArcError,
  errAsync,
  fromAsyncThrowable,
  type Result,
  type ResultAsync,
} from "../../lib/kernel/index.js";
import type {
  Probe,
} from "./types.js";
import type { SessionRemoteContext } from "../../handlers/status-remote-context.js";

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Mandatory identity short-circuit for an identity-scoped status slot. */
export class SessionIdentityMissingError extends ArcError {
  readonly slot: string;

  constructor(slot: string) {
    const label = slot === "user" ? "User" : "Session locus state";
    super(`${label} probe skipped: \`arc.identity\` is not configured in git config.`, "session.identity-missing");
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

/** One resolved internal session slot. */
export type SessionResult<Value> = Result<Value, SessionStatusError>;

/** Wrap one probe invocation in the typed asynchronous error channel. */
export function safeProbe<Value>(
  slot: string,
  probe: () => Promise<Value>,
): ResultAsync<Value, SessionProbeError> {
  return fromAsyncThrowable(probe, (cause) => new SessionProbeError(slot, cause))();
}

/** One memoized internal context with per-dependent probe error isolation. */
export interface SessionRemoteContextSlot {
  run<Value>(
    slot: string,
    probe: (context: SessionRemoteContext) => Promise<Value>,
  ): ResultAsync<Value, SessionProbeError>;
}

/** Build the internal request-context prerequisite shared by session-init dependents. */
export function buildSessionRemoteContextSlot(
  contextProbe: () => Promise<SessionRemoteContext>,
): SessionRemoteContextSlot {
  const context = safeProbe("remoteContext", contextProbe);
  return {
    run: <Value>(slot: string, probe: (value: SessionRemoteContext) => Promise<Value>) =>
      safeProbe(slot, async (): Promise<Value> => {
        const resolved = await context;
        if (resolved.isErr()) throw resolved.error.originalCause;
        if (resolved.value.kind === "unavailable") {
          throw new Error(`Session remote prerequisite failed: ${resolved.value.prerequisite}.`);
        }
        return probe(resolved.value);
      }),
  };
}

/** Declare an optional probe only when its gate fires. */
export function gatedSlot<Value>(
  condition: boolean,
  slot: string,
  probe: () => Promise<Value>,
): ResultAsync<Value, SessionProbeError> | undefined {
  return condition ? safeProbe(slot, probe) : undefined;
}

/** Declare an identity-scoped user probe with a typed immediate absence error. */
export function userSlot<Value>(
  identity: string | null,
  probe: (identity: string) => Promise<Value>,
): ResultAsync<Value, SessionIdentityMissingError | SessionProbeError> {
  return identity === null
    ? errAsync(new SessionIdentityMissingError("user"))
    : safeProbe("user", () => probe(identity));
}

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
