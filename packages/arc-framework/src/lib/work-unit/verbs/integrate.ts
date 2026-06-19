/**
 * The `integrate` verb — open review on an `Active` WU (`Active → Integrating`).
 *
 * `integrate` is the forward half of the `integrate` ⊥ `reopen` phase-axis pair: it
 * marks a WU's **entry into review**, not the merge — the integration-interlock owns
 * merge approval, and the description disambiguates that effect exactly as `reopen`
 * does for its withdrawal. A `set-phase`-only move — `Active → Integrating`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the render + `user-workspace`
 * side-effects and sets the integration orientation from caller inputs.
 *
 * The verb stays thin: it forwards the two judgment soft-field `input` values the
 * edge requires — `Last Completed` (the work being submitted) and `Next Action`
 * (the integration pointer, e.g. "open the PR") — and dispatches through
 * {@link executeTransition}; the `set-phase` leg, the side-effects, and the
 * soft-field disposition (resetting the now-closed `Next Task`) are the table's. The
 * orientation values are never fabricated here — a missing input is the executor's
 * rejection. A non-`Active` source falls to the table's illegal-edge lookup.
 *
 * @module
 */

import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";

/** The orientation inputs an `integrate` supplies. */
export interface IntegrateParams {
  /** Target WU name (the CLI defaults this to the current Active WU). */
  name: string;
  /** The work being submitted for review — the `Last Completed` `input` the edge requires. */
  lastCompleted: string;
  /** The integration pointer (e.g. "open the PR") — the `Next Action` `input` the edge requires. */
  nextAction: string;
}

/** The outcome of an `integrate` attempt — a rejection, or the integrating meta path. */
export type IntegrateResult =
  | { status: "rejected"; reason: string }
  | { status: "integrated"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run `integrate`: flip the WU's phase `Active → Integrating` and set the
 * integration orientation soft fields. Rejects when the source is not an `Active`
 * WU (the table's illegal-edge lookup).
 *
 * @param ctx - The executor seams (the render + `user-workspace` handlers are registered by the caller).
 * @param params - The target WU and the integration orientation inputs.
 * @returns A rejection (illegal source, or executor failure) or the integrating meta path.
 */
export async function runIntegrate(
  ctx: ExecuteTransitionContext,
  params: IntegrateParams,
): Promise<IntegrateResult> {
  const { name, lastCompleted, nextAction } = params;

  const outcome = await executeTransition(ctx, {
    verb: "integrate",
    slug: name,
    inputs: { softFields: { lastCompleted, nextAction } },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "integrated", outcome, metaPath: `.arc/active/meta-${name}.md` };
}
