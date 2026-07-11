/** Guarded read-reduce-effect-publish orchestration for one pull request. */

import type { GateProjection, ReviewRequest } from "../core/execution.js";
import type { RequestExecutionResult } from "../core/request-execution.js";

export interface CanonicalReconcileState {
  repositoryId: number;
  pullRequestNumber: number;
  headSha: string;
  policyVersion: string;
  permissionVersion: string;
  ledgerVersion: number;
}

export interface ReconcileDecision {
  request: ReviewRequest | null;
  projection: GateProjection;
}

export interface ReconcileRuntime {
  read(): Promise<CanonicalReconcileState>;
  reduce(state: CanonicalReconcileState, now: Date): Promise<ReconcileDecision>;
  execute(request: ReviewRequest, expectedLedgerVersion: number): Promise<RequestExecutionResult>;
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
  let effect: RequestExecutionResult | null = null;
  if (decision.request !== null) {
    const beforeEffect = await runtime.read();
    if (guard(beforeEffect) !== guard(initial) || beforeEffect.ledgerVersion !== initial.ledgerVersion) {
      return { status: "stale-before-effect", effect: null };
    }
    effect = await runtime.execute(decision.request, initial.ledgerVersion);
  }
  const final = await runtime.read();
  if (guard(final) !== guard(initial)) return { status: "stale-after-effect", effect };
  const currentDecision = await runtime.reduce(final, now);
  await runtime.publish(currentDecision.projection);
  return { status: "published", effect };
}
