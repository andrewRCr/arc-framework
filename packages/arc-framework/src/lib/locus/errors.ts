/** Locus-domain failures at untrusted operational boundaries. */

import { z } from "zod";

import { ArcError, toArcError } from "../kernel/index.js";
import { LocusOperationalErrorCodeSchema } from "./schema/mutation.js";

/** The operational arm of the public error vocabulary, inferred from its one runtime schema. */
export type LocusErrorCode = z.infer<typeof LocusOperationalErrorCodeSchema>;

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
  return LocusOperationalErrorCodeSchema.safeParse(value).success;
}
