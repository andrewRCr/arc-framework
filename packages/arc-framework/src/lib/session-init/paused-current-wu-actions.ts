/** Action-only pause guard for the read-only current-work-unit reconcile projection. */
import type { Store } from "../store/contract.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type { CurrentWuReconcileSessionResult } from "./current-wu-reconcile.js";
/** Replace advancement actions using the already acquired frame context; never read pause during preparation. */
export function withPausedCurrentWuActions(result: CurrentWuReconcileSessionResult,
  store: Store, context: Pick<NonNullable<DerivedCheckoutRow["context"]>, "pause"> | null): CurrentWuReconcileSessionResult {
  if (!store.capabilities.stateOffBranch || context?.pause == null || result.status !== "pending") return result;
  const apply = ["arc", "wu", "reconcile", result.slug, "--apply", "--json"];
  return { ...result, ...(result.actions === undefined ? {} : { actions: result.actions.map(action =>
    action.argv?.length === apply.length && action.argv.every((arg, index) => arg === apply[index])
      ? { ...action, text: `Run arc resume ${result.slug}, then arc wu reconcile ${result.slug} --apply --json once resumed.`,
        argv: ["arc", "resume", result.slug] } : action) }) };
}
