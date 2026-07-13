/** Guarded read-reduce-effect-publish orchestration for one pull request. */

import type { GateProjection, ReceiptEnvelope, ReviewReceipt, ReviewRequest } from "../core/execution.js";
import type { ReviewGateAction } from "../core/next-action.js";
import type { RequestExecutionResult } from "../core/request-execution.js";

export interface CanonicalReconcileState {
  repositoryId: number;
  pullRequestNumber: number;
  headSha: string;
  policyVersion: string;
  permissionVersion: string;
  ledgerVersion: number | null;
}

export interface ReconcileDecision {
  request: ReviewRequest | null;
  receiptsToAppend?: ReviewReceipt[];
  requestReservation?: ReviewReceipt | null;
  reservationEnvelope?: ReceiptEnvelope | null;
  projection: GateProjection;
  action?: ReviewGateAction;
}

export interface ReconcileRuntime {
  read(): Promise<CanonicalReconcileState>;
  reduce(state: CanonicalReconcileState, now: Date): Promise<ReconcileDecision>;
  appendReceipts?(receipts: ReviewReceipt[], expectedLedgerVersion: number): Promise<number>;
  reserve(
    request: ReviewRequest,
    expectedLedgerVersion: number,
    reservation?: ReviewReceipt | null,
  ): Promise<{ envelope: ReceiptEnvelope; created: boolean } | null>;
  confirmPending(
    request: ReviewRequest,
    reservation: ReceiptEnvelope,
    projection: GateProjection,
  ): Promise<boolean>;
  execute(request: ReviewRequest, reservation: ReceiptEnvelope): Promise<RequestExecutionResult>;
  publish(projection: GateProjection): Promise<void>;
}

export interface ReconcileResult {
  status:
    | "published"
    | "stale-before-effect"
    | "stale-after-effect"
    | "pending-unconfirmed"
    | "reservation-adopted"
    | "action-ready";
  effect: RequestExecutionResult | null;
}

function guard(state: CanonicalReconcileState): string {
  return [state.repositoryId, state.pullRequestNumber, state.headSha, state.policyVersion, state.permissionVersion].join(":");
}

/** Re-read around effects so stale workers cannot author the current projection. */
export async function reconcile(runtime: ReconcileRuntime, now: Date): Promise<ReconcileResult> {
  const initial = await runtime.read();
  const decision = await runtime.reduce(initial, now);
  const receiptsToAppend = decision.receiptsToAppend ?? [];
  let effect: RequestExecutionResult | null = null;
  if ((receiptsToAppend.length > 0 || decision.request !== null) && initial.ledgerVersion !== null) {
    const beforeEffect = await runtime.read();
    if (guard(beforeEffect) !== guard(initial) || beforeEffect.ledgerVersion !== initial.ledgerVersion) {
      return { status: "stale-before-effect", effect: null };
    }
    let effectVersion = initial.ledgerVersion;
    if (receiptsToAppend.length > 0) {
      if (runtime.appendReceipts === undefined) throw new Error("reconcile: receipt append capability is missing");
      effectVersion = await runtime.appendReceipts(receiptsToAppend, effectVersion);
    }
    if (decision.request !== null) {
      const reserved = await runtime.reserve(decision.request, effectVersion, decision.requestReservation);
      if (reserved === null) return { status: "pending-unconfirmed", effect: null };
      const afterReservation = await runtime.read();
      if (
        guard(afterReservation) !== guard(initial)
        || afterReservation.ledgerVersion !== reserved.envelope.ledgerVersion
      ) {
        return { status: "stale-before-effect", effect: null };
      }
      const pendingDecision = await runtime.reduce(afterReservation, now);
      await runtime.publish(pendingDecision.projection);
      const pendingConfirmed = await runtime.confirmPending(
        decision.request,
        reserved.envelope,
        pendingDecision.projection,
      );
      if (!pendingConfirmed) return { status: "pending-unconfirmed", effect: null };
      if (decision.request.requestMechanism === "user-trigger" && reserved.created) {
        return { status: "action-ready", effect: null };
      }
      if (!reserved.created && decision.request.requestMechanism !== "user-trigger") {
        return { status: "reservation-adopted", effect: null };
      }
      const beforeExecute = await runtime.read();
      if (
        guard(beforeExecute) !== guard(initial)
        || beforeExecute.ledgerVersion !== reserved.envelope.ledgerVersion
      ) {
        return { status: "stale-before-effect", effect: null };
      }
      effect = await runtime.execute(decision.request, reserved.envelope);
    }
  }
  const final = await runtime.read();
  if (guard(final) !== guard(initial)) return { status: "stale-after-effect", effect };
  const currentDecision = await runtime.reduce(final, now);
  await runtime.publish(currentDecision.projection);
  return { status: "published", effect };
}
