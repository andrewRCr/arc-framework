/**
 * The `reopen` verb — withdraw an `Integrating` WU back to `Active`.
 *
 * `reopen` is the genuinely-missing inverse of `integrate`: it pulls a WU out of
 * review for more work. A `set-phase`-only move — `Integrating → Active`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the `withdraw-pr` side-effect to
 * close (or, per `inputs`, convert-to-draft) the open PR. The `pr-unmerged` guard
 * clears only a positively-unmerged PR: a merged PR is refused (backing out merged
 * work is a new origin-linked follow-up, never a same-unit reopen), and so is an
 * unverifiable merge state (`gh`/remote unavailable) — the safe default.
 *
 * The verb stays thin — it forwards the merge fact and the withdrawal mode as
 * `inputs` and dispatches through {@link executeTransition}; the guard, the
 * `set-phase` leg, the `withdraw-pr` handler, and the soft-field disposition
 * (clearing the now-stale integration `Next Action` pointer) are the table's. The
 * merge fact is resolved against `gh` by the caller (never fabricated here); the
 * withdrawal mode defaults to `close`.
 *
 * @module
 */

import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type { PrWithdrawMode } from "../side-effects/withdraw-pr.js";

/** The inputs a `reopen` supplies. */
export interface ReopenParams {
  /** Target WU name (the CLI defaults this to the current Integrating WU). */
  name: string;
  /** Whether the WU's PR has merged — the `pr-unmerged` guard input (caller resolves via `gh`). */
  prMerged?: boolean;
  /** How to withdraw the open PR — `close` (default) or `draft`. */
  withdrawMode?: PrWithdrawMode;
}

/** The outcome of a `reopen` attempt — a rejection, or the re-activated meta path. */
export type ReopenResult =
  | { status: "rejected"; reason: string }
  | { status: "reopened"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run `reopen`: flip the WU's phase `Integrating → Active` and withdraw its open
 * PR. Rejects when the PR has already merged or its merge state can't be confirmed
 * (the `pr-unmerged` guard) or the source is not an `Integrating` WU (the table's
 * illegal-edge lookup).
 *
 * @param ctx - The executor seams (the `withdraw-pr` handler is registered by the caller).
 * @param params - The target WU, the merge fact, and the withdrawal mode.
 * @returns A rejection (merged PR, illegal source) or the re-activated meta path.
 */
export async function runReopen(
  ctx: ExecuteTransitionContext,
  params: ReopenParams,
): Promise<ReopenResult> {
  const { name, prMerged, withdrawMode } = params;

  const outcome = await executeTransition(ctx, {
    verb: "reopen",
    slug: name,
    inputs: { prMerged, prWithdrawMode: withdrawMode ?? "close" },
  });

  if (outcome.status !== "ok") return { status: "rejected", reason: outcome.message };
  return { status: "reopened", outcome, metaPath: `.arc/active/meta-${name}.md` };
}
