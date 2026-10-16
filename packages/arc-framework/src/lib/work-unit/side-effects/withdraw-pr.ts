/**
 * The `withdraw-pr` side-effect — pull an `Integrating` WU's open PR back out of
 * review at `reopen`.
 *
 * Two modes:
 *
 * - `close` — the default: close the PR outright (`gh pr close`). The branch
 *   stays; the review thread ends.
 * - `draft` — the `--keep-pr` path: convert the PR back to a draft
 *   (`gh pr ready --undo`), leaving it open but out of active review.
 *
 * The mode is a judgment input (it does not touch the state model — `reopen`
 * lands `Active` either way), settled against the `gh` surface at execution. PR
 * withdrawal is a net-new `gh` *write* — no existing wrapper covers it — modeled
 * on the read-side `gh` source and hand-rolled behind the injected executor (the
 * execa migration is `cli-substrate-adoption`'s). The `gh`-merged precondition is
 * the `pr-unmerged` guard's, upstream of this leg; a merged PR never reaches here.
 *
 * @module
 */

import type { SideEffectContext, SideEffectHandler } from "../lifecycle-executor.js";
import type { LifecycleGitStep } from "../store-transition-types.js";
import type { GitExec } from "../../git/exec.js";

/** How `reopen` withdraws the open PR — close it, or convert it back to a draft. */
export type PrWithdrawMode = "close" | "draft";

/** Dependencies for {@link withdrawPr} — the injected command executor (runs `gh`). */
export interface WithdrawPrContext {
  exec: GitExec;
}

/** The PR to withdraw and how. */
export interface WithdrawPrOp {
  /** The PR's head branch — `gh` resolves the PR from it. */
  branch: string;
  /** Close the PR outright, or convert it back to a draft. */
  mode: PrWithdrawMode;
}

/**
 * Withdraw a work unit's open PR per `op` — close it, or convert it back to a
 * draft — via the GitHub CLI.
 *
 * @param ctx - Injected command executor.
 * @param op - The head branch and the withdrawal mode.
 */
export async function withdrawPr(ctx: WithdrawPrContext, op: WithdrawPrOp): Promise<void> {
  const observed = await ctx.exec("gh", ["pr", "view", op.branch, "--json", "state,isDraft"]);
  const parsed: unknown = JSON.parse(observed.stdout);
  if (typeof parsed === "object" && parsed !== null) {
    const state = "state" in parsed ? parsed.state : undefined;
    const isDraft = "isDraft" in parsed ? parsed.isDraft : undefined;
    if (op.mode === "close" && state === "CLOSED") return;
    if (op.mode === "draft" && state === "OPEN" && isDraft === true) return;
  }
  if (op.mode === "draft") {
    await ctx.exec("gh", ["pr", "ready", op.branch, "--undo"]);
    return;
  }
  await ctx.exec("gh", ["pr", "close", op.branch]);
}

/** A withdrawal callback that captures its physical operation before state persistence. */
export type RecoverablePrWithdrawalHandler = SideEffectHandler & {
  prepareWithdrawal: (context: SideEffectContext) => Promise<LifecycleGitStep>;
};

/** Capture the selected PR and mode for post-write execution and an independent retry.
 * @param ctx - Request-owned command executor.
 * @param op - Exact head branch and mode selected before the record write.
 * @returns The existing lifecycle Git step, with its physical gh continuation.
 */
export function preparePrWithdrawal(ctx: WithdrawPrContext, op: WithdrawPrOp): LifecycleGitStep {
  const captured = { ...op };
  const args = captured.mode === "draft" ? ["pr", "ready", captured.branch, "--undo"] : ["pr", "close", captured.branch];
  return { name: "withdraw-pr", run: () => withdrawPr(ctx, captured), retryCommand: ["gh", ...args] };
}
