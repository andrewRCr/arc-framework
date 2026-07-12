/** Guarded read-reduce-effect-publish orchestration for one pull request. */

import type { GateProjection, ReviewReceipt, ReviewRequest } from "../core/execution.js";
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
  projection: GateProjection;
}

export interface ReconcileRuntime {
  read(): Promise<CanonicalReconcileState>;
  reduce(state: CanonicalReconcileState, now: Date): Promise<ReconcileDecision>;
  appendReceipts?(receipts: ReviewReceipt[], expectedLedgerVersion: number): Promise<number>;
  execute(
    request: ReviewRequest,
    expectedLedgerVersion: number,
    reservation?: ReviewReceipt | null,
  ): Promise<RequestExecutionResult>;
  publish(projection: GateProjection): Promise<void>;
}

export interface ReconcileResult {
  status: "published" | "stale-before-effect" | "stale-after-effect";
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
      effect = await runtime.execute(decision.request, effectVersion, decision.requestReservation);
    }
  }
  const final = await runtime.read();
  if (guard(final) !== guard(initial)) return { status: "stale-after-effect", effect };
  const currentDecision = await runtime.reduce(final, now);
  await runtime.publish(currentDecision.projection);
  return { status: "published", effect };
}
