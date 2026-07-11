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

/** Injected effects for one request execution. */
export interface RequestExecutionInput {
  request: ReviewRequest;
  expectedLedgerVersion: number;
  appendReservation: (request: ReviewRequest, expectedLedgerVersion: number) => Promise<ReceiptEnvelope>;
  confirmReservation: (requestKey: string) => Promise<ReservationConfirmation>;
  invoke: (request: ReviewRequest) => Promise<RequestAcknowledgement>;
  appendAcknowledgement: (
    acknowledgement: RequestAcknowledgement,
    reservation: ReceiptEnvelope,
  ) => Promise<void>;
  appendTerminalFailure: (reservation: ReceiptEnvelope) => Promise<void>;
}

/** Effect result: invocation is explicit so callers never infer replay safety. */
export interface RequestExecutionResult {
  status: "acknowledged" | "reservation-unconfirmed" | "invocation-ambiguous";
  invoked: boolean;
}

/** Append and canonically confirm a reservation before invoking exactly once. */
export async function executeReservedRequest(input: RequestExecutionInput): Promise<RequestExecutionResult> {
  const reservation = await input.appendReservation(input.request, input.expectedLedgerVersion);
  const requestKey = computeRequestKey(input.request);
  const confirmation = await input.confirmReservation(requestKey);
  if (
    !confirmation.canonical
    || confirmation.envelope === null
    || confirmation.envelope.receipt.action !== "reserved"
    || computeRequestKey(confirmation.envelope.receipt.request) !== requestKey
    || confirmation.envelope.receipt.receiptHash !== reservation.receipt.receiptHash
  ) {
    return { status: "reservation-unconfirmed", invoked: false };
  }
  let acknowledgement: RequestAcknowledgement;
  try {
    acknowledgement = await input.invoke(input.request);
  } catch {
    await input.appendTerminalFailure(reservation);
    return { status: "invocation-ambiguous", invoked: true };
  }
  await input.appendAcknowledgement(acknowledgement, reservation);
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
