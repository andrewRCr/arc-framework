/** Typed local slot outcomes and the adapter to public status Probe slots. */

import { ArcError } from "../../lib/kernel/index.js";
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

/** Exhaustive internal error channel for status composition. */
export type SessionStatusError =
  | SessionIdentityMissingError
  | SessionProbeError
  | SessionCompositionError;

/** One resolved internal slot with the public Probe success discriminant. */
export type SessionResult<Value, Failure extends SessionStatusError = SessionStatusError> =
  | { ok: true; value: Value }
  | { ok: false; error: Failure };

/**
 * Produce a successful local slot without changing its value identity.
 * @param value - Resolved probe value.
 * @returns The successful slot with its original value.
 */
export function resolvedSlot<Value>(value: Value): { ok: true; value: Value } {
  return { ok: true, value };
}

/**
 * Propagate a typed local slot failure without changing its error identity.
 * @param error - Typed status failure.
 * @returns The failed slot with its original error.
 */
export function failedSlot<Failure extends SessionStatusError>(error: Failure): { ok: false; error: Failure } {
  return { ok: false, error };
}

/**
 * Enrich a successful slot while preserving a failed slot.
 * @param result - Resolved status slot.
 * @param map - Transformation applied only to success.
 * @returns The mapped success or unchanged failure.
 */
export function mapSlot<Value, Mapped, Failure extends SessionStatusError>(
  result: SessionResult<Value, Failure>,
  map: (value: Value) => Mapped,
): SessionResult<Mapped, Failure> {
  return result.ok ? resolvedSlot(map(result.value)) : result;
}

/**
 * Resolve an intentionally fallible synchronous composition.
 * @param operation - Composition operation label.
 * @param slot - Destination status slot.
 * @param compose - Synchronous composition to evaluate.
 * @returns Its value or a typed composition failure.
 */
export function composeSlot<Value>(
  operation: string,
  slot: string,
  compose: () => Value,
): SessionResult<Value, SessionCompositionError> {
  try {
    return resolvedSlot(compose());
  } catch (cause) {
    return failedSlot(new SessionCompositionError(operation, slot, cause));
  }
}

/**
 * Resolve one probe independently, capturing synchronous and asynchronous failure.
 * @param slot - Destination status slot.
 * @param probe - Independent asynchronous probe.
 * @returns Its value or a typed probe failure.
 */
export async function safeProbe<Value>(
  slot: string,
  probe: () => Promise<Value>,
): Promise<SessionResult<Value, SessionProbeError>> {
  try {
    return resolvedSlot(await probe());
  } catch (cause) {
    return failedSlot(new SessionProbeError(slot, cause));
  }
}

/** One memoized internal context with per-dependent probe error isolation. */
export interface SessionRemoteContextSlot {
  run<Value>(
    slot: string,
    probe: (context: SessionRemoteContext) => Promise<Value>,
  ): Promise<SessionResult<Value, SessionProbeError>>;
}

/**
 * Build the internal request-context prerequisite shared by session-init dependents.
 * @param contextProbe - Shared request-context probe.
 * @returns A memoized context with independent dependent failures.
 */
export function buildSessionRemoteContextSlot(
  contextProbe: () => Promise<SessionRemoteContext>,
): SessionRemoteContextSlot {
  const context = safeProbe("remoteContext", contextProbe);
  return {
    run: <Value>(slot: string, probe: (value: SessionRemoteContext) => Promise<Value>) =>
      safeProbe(slot, async (): Promise<Value> => {
        const resolved = await context;
        if (!resolved.ok) throw resolved.error.originalCause;
        if (resolved.value.kind === "unavailable") {
          throw new Error(`Session remote prerequisite failed: ${resolved.value.prerequisite}.`);
        }
        return probe(resolved.value);
      }),
  };
}

/**
 * Declare an optional probe only when its gate fires.
 * @param condition - Whether this probe is enabled.
 * @param slot - Destination status slot.
 * @param probe - Probe invoked only when enabled.
 * @returns The pending outcome or undefined when gated off.
 */
export function gatedSlot<Value>(
  condition: boolean,
  slot: string,
  probe: () => Promise<Value>,
): Promise<SessionResult<Value, SessionProbeError>> | undefined {
  return condition ? safeProbe(slot, probe) : undefined;
}

/**
 * Declare an identity-scoped user probe with a typed immediate absence error.
 * @param identity - Configured identity or null.
 * @param probe - Identity-scoped asynchronous probe.
 * @returns The user outcome or typed identity absence.
 */
export function userSlot<Value>(
  identity: string | null,
  probe: (identity: string) => Promise<Value>,
): Promise<SessionResult<Value, SessionIdentityMissingError | SessionProbeError>> {
  return identity === null
    ? Promise.resolve(failedSlot(new SessionIdentityMissingError("user")))
    : safeProbe("user", () => probe(identity));
}

/**
 * Adapt one resolved internal slot to the stable public Probe wire union.
 *
 * @param result - Independently resolved status slot
 * @returns Stable success/error probe branch
 */
export function toProbe<Value>(result: SessionResult<Value>): Probe<Value> {
  if (result.ok) return { ok: true, value: result.value };
  return {
    ok: false,
    error: {
      kind: result.error instanceof SessionIdentityMissingError ? "identity-missing" : "runtime",
      message: result.error.message,
    },
  };
}
