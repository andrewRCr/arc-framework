/** Authenticated former names retained in a terminal owner's primary history. */
import type { Store, HistoryEntry } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { recordReferences, sameOwner, type OwnerIdentity } from "../store/identity.js";

/** Read former names only within the UID of each selected terminal record.
 * @param store - Operational history reader.
 * @param terminals - Completely enumerated terminal lineage records.
 * @returns Former names mapped to every evidenced terminal name, retaining ambiguity.
 */
export async function readTerminalReferenceAliases(store: Store, terminals: readonly StoreRecord[]): Promise<StoreResult<ReadonlyMap<string, readonly string[]>>> {
  const aliases = new Map<string, string[]>();
  for (const terminal of terminals) {
    const owner = terminal.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) continue;
    const history = await store.history({ reference: recordReferences["work-item/meta"](owner) });
    if (history.status === "refused") {
      if (history.refusal.code === "not-found") continue;
      return history;
    }
    appendHistoryAliases(aliases, history.result, owner);
  }
  return { status: "ok", result: aliases };
}

function appendHistoryAliases(aliases: Map<string, string[]>, history: readonly HistoryEntry[], owner: OwnerIdentity): void {
  for (const entry of history) {
    const prior = entry.reference;
    if (prior.kind !== "work-item/meta" || !sameOwner(prior.owner, owner) || prior.owner.name === owner.name) continue;
    const targets = aliases.get(prior.owner.name) ?? [];
    if (!targets.includes(owner.name)) targets.push(owner.name);
    aliases.set(prior.owner.name, targets);
  }
}
