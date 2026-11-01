/** Recoverable object-loss refusals with the caller's retained-history coordinates. */

import type { RecordReference } from "../identity.js";
import type { HistoryRef, Remedy, StoreRefusal } from "../refusal.js";

/** Keep object restoration distinct from repairing present state, retaining any more specific caller text. */
export function missingRefObjects(ref: string, options: {
  historyRefs: HistoryRef[]; reference?: RecordReference; condition?: string; remedy?: Remedy;
}): StoreRefusal {
  return { code: "state-unresolvable", class: "recoverable", historyRefs: options.historyRefs,
    ...options.reference ? { reference: options.reference } : {},
    condition: options.condition ?? `Objects required to read ${ref} are unavailable locally.`,
    remedy: options.remedy ?? { text: `Restore or fetch the missing objects for ${ref} in the store repository, then retry.` },
  };
}
