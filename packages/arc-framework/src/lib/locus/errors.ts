/** Locus-domain failures at untrusted operational boundaries. */

import { ArcError, toArcError } from "../kernel/index.js";

export type LocusErrorCode =
  | "locus.parse.invalid"
  | "locus.topology.unavailable"
  | "locus.persistence.read"
  | "locus.persistence.write"
  | "locus.lock.acquire"
  | "locus.lock.release"
  | "locus.mutation.failed";

/** Operational locus error with a locally exhaustive code contract. */
export class LocusError extends ArcError {
  override readonly code: LocusErrorCode;

  constructor(message: string, code: LocusErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "LocusError";
    this.code = code;
  }
}

interface LocusErrorFallback {
  readonly code: LocusErrorCode;
  readonly message: string;
}

/** Project an operational failure into the mutation error arm. */
export function toLocusErrorPayload(
  value: unknown,
  fallback: LocusErrorFallback = { code: "locus.mutation.failed", message: "Session locus mutation failed" },
): { code: LocusErrorCode; message: string } {
  const error = value instanceof LocusError
    ? value
    : toArcError(value, fallback);
  const code = isLocusErrorCode(error.code) ? error.code : fallback.code;
  return { code, message: error instanceof LocusError ? error.message : fallback.message };
}

function isLocusErrorCode(value: string): value is LocusErrorCode {
  return value === "locus.parse.invalid"
    || value === "locus.topology.unavailable"
    || value === "locus.persistence.read"
    || value === "locus.persistence.write"
    || value === "locus.lock.acquire"
    || value === "locus.lock.release"
    || value === "locus.mutation.failed";
}
