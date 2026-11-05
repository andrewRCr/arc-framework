/** Admit live-to-history destinations against the namespace captured under their locks. */
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { syncRefIsAncestor } from "./sync-graph.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { refObjectFault } from "./object-fault.js";
import { missingHistoryRefs } from "./missing-history.js";

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
      const condition = `Could not read retained history on ${history}: ${error.message}`;
      const remedy = { text: `Restore or fetch the missing objects for ${history} in the store repository, then retry.` };
      if (await isUnavailableGraphFailure(context, error)) return refObjectFault(history, "missing", {
        condition, remedy, historyRefs: await missingHistoryRefs(context, [history], tips),
      }).refusal;
      return { code: "namespace-corrupt", class: "terminal", namespace: history, condition, remedy };
    }
    return historyDestinationFailure(history, `The retained history on ${history} is not an ancestor of ${live}.`);
  }
  return undefined;
}

/** Nonancestor destinations and repeated outside changes require explicit history repair. */
export function historyDestinationFailure(history: string, condition: string): StoreRefusal {
  return { code: "namespace-corrupt", class: "terminal", namespace: history, condition,
    remedy: { text: `Repair ${history} so its tip is an ancestor of the live tip, or remove it if it is a stray ref, then retry the write.` } };
}
