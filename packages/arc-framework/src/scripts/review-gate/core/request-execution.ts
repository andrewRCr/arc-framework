/** Reserve-confirm-invoke protocol and authenticated timing reduction. */

import type {
  ReceiptEnvelope,
  ReviewRequest,
} from "./execution.js";
import type { RequestAcknowledgement } from "./ports.js";
import { computeRequestKey } from "./request-key.js";

/** Confirmation read after a reservation append. */
export interface ReservationConfirmation {
  canonical: boolean;
  envelope: ReceiptEnvelope | null;
}

/** Injected storage effects for one request reservation. */
export interface RequestReservationInput {
  request: ReviewRequest;
  expectedLedgerVersion: number;
  appendReservation: (
    request: ReviewRequest,
    expectedLedgerVersion: number,
  ) => Promise<{ envelope: ReceiptEnvelope; created: boolean }>;
  confirmReservation: (requestKey: string) => Promise<ReservationConfirmation>;
}

/** Injected provider effects after pending state is canonically confirmed. */
export interface ConfirmedRequestExecutionInput {
  request: ReviewRequest;
  reservation: ReceiptEnvelope;
  invoke: (request: ReviewRequest) => Promise<RequestAcknowledgement>;
  appendAcknowledgement: (
    acknowledgement: RequestAcknowledgement,
    reservation: ReceiptEnvelope,
  ) => Promise<void>;
  appendTerminalFailure: (
    reservation: ReceiptEnvelope,
    failure: { disposition: "pre-effect" | "ambiguous"; reason: string },
  ) => Promise<void>;
}

/** Effect result: invocation is explicit so callers never infer replay safety. */
export interface RequestExecutionResult {
  status: "acknowledged" | "pre-effect-rejected" | "invocation-ambiguous";
  invoked: boolean;
}

function invocationFailure(error: unknown): { disposition: "pre-effect" | "ambiguous"; reason: string } {
  const candidate = error as { code?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "unclassified-invocation-failure";
  return code.startsWith("pre-effect-rejection:")
    ? { disposition: "pre-effect", reason: code }
    : { disposition: "ambiguous", reason: code };
}

/** Append and canonically confirm a reservation without performing the provider effect. */
export async function reserveRequest(
  input: RequestReservationInput,
): Promise<{ envelope: ReceiptEnvelope; created: boolean } | null> {
  const reservation = await input.appendReservation(input.request, input.expectedLedgerVersion);
  const requestKey = computeRequestKey(input.request);
  const confirmation = await input.confirmReservation(requestKey);
  if (
    !confirmation.canonical
    || confirmation.envelope === null
    || confirmation.envelope.receipt.action !== "reserved"
    || computeRequestKey(confirmation.envelope.receipt.request) !== requestKey
    || confirmation.envelope.receipt.receiptHash !== reservation.envelope.receipt.receiptHash
  ) {
    return null;
  }
  return { envelope: confirmation.envelope, created: reservation.created };
}

/** Invoke one newly reserved request after the caller confirms its pending projection. */
export async function executeConfirmedRequest(
  input: ConfirmedRequestExecutionInput,
): Promise<RequestExecutionResult> {
  let acknowledgement: RequestAcknowledgement;
  try {
    acknowledgement = await input.invoke(input.request);
  } catch (error) {
    const failure = invocationFailure(error);
    await input.appendTerminalFailure(input.reservation, failure);
    return {
      status: failure.disposition === "pre-effect" ? "pre-effect-rejected" : "invocation-ambiguous",
      invoked: true,
    };
  }
  await input.appendAcknowledgement(acknowledgement, input.reservation);
  return { status: "acknowledged", invoked: true };
}

/** Timing state derived only from store-authenticated record timestamps. */
export function evaluateRequestTiming(input: {
  reservation: ReceiptEnvelope;
  acknowledgement: ReceiptEnvelope | null;
  terminalEvidence: boolean;
  now: Date;
}): "waiting" | "ambiguous-reservation" | "acknowledged-timeout" | "terminal" {
  if (input.terminalEvidence) return "terminal";
  if (input.acknowledgement === null) {
    const elapsed = input.now.getTime() - Date.parse(input.reservation.recordedAt);
    return elapsed >= 10 * 60 * 1000 ? "ambiguous-reservation" : "waiting";
  }
  const elapsed = input.now.getTime() - Date.parse(input.acknowledgement.recordedAt);
  return elapsed >= 60 * 60 * 1000 ? "acknowledged-timeout" : "waiting";
}
