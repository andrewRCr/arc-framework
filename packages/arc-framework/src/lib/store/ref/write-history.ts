/** Admit live-to-history destinations against the namespace captured under their locks. */
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { corruptRef } from "./namespace-health.js";
import { syncRefIsAncestor } from "./sync-graph.js";

/** Existing retained history must be an ancestor of the live tip that will replace it. */
export async function checkRefHistoryDestinations(context: RefBackendContext, tips: ReadonlyMap<string, string>,
  moves: readonly { live: string; history: string }[]): Promise<StoreRefusal | undefined> {
  for (const { live, history } of moves) {
    const retained = tips.get(history);
    if (!retained) continue;
    const source = tips.get(live);
    try {
      if (source && await syncRefIsAncestor(context, retained, source)) continue;
    } catch (error) {
      if (!isGitProcessError(error) || !isCompletedGitFailure(error)) throw error;
      return { ...corruptRef(history, true), condition: `Could not read retained history on ${history}: ${error.message}` };
    }
    return historyDestinationFailure(history, `The retained history on ${history} is not an ancestor of ${live}.`);
  }
  return undefined;
}

/** A stray or changed destination cannot be retried as though its held lock still protected the captured tip. */
export function historyDestinationFailure(history: string, condition: string): StoreRefusal {
  return { code: "namespace-corrupt", class: "terminal", namespace: history, condition,
    remedy: { text: `Repair ${history} so its tip is an ancestor of the live tip, or remove it if it is a stray ref, then retry the write.` } };
}
