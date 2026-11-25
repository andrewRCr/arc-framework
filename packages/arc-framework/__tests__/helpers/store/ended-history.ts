/** A clone lacking an ended item's history ref until a pull names it, refusing as the ref backend does. */
import { HistoryRefSchema, PullResultSchema, type OwnerIdentity, type RecordReference, type Store, type StoreRefusal } from "../../../src/lib/store/index.js";

/**
 * Refuse writes, batches, and history reads of the item's records `state-unresolvable`, naming its history ref, until a
 * pull names that ref. Current reads stay served, as the ref backend serves them from the item's archive ref.
 */
export function lackingEndedHistory(store: Store, item: OwnerIdentity): Store {
  if (!("uid" in item) || item.uid === undefined) throw new Error("An ended item's history ref names its UID");
  const history = HistoryRefSchema.parse(`refs/arc/history/work/${item.uid}`);
  let held = false;
  const missing = (reference: RecordReference): StoreRefusal | null => held || reference.owner.type !== item.type
    || reference.owner.name !== item.name ? null : { code: "state-unresolvable", class: "recoverable", reference,
    historyRefs: [history], condition: "The retained history does not contain every batch named by this item's archive folders.",
    remedy: { text: `Pull ${history} by name, then retry the operation. Restore the ref from a clone holding it if the remote no longer has it.` } };
  const refuse = (reference: RecordReference) => {
    const refusal = missing(reference);
    return refusal === null ? null : { status: "refused" as const, refusal };
  };
  return { capabilities: store.capabilities,
    read: input => store.read(input), list: input => store.list(input), version: () => store.version(),
    changes: input => store.changes(input), lookup: input => store.lookup(input), push: input => store.push(input),
    maintain: () => store.maintain(),
    write: async input => refuse(input.reference) ?? store.write(input),
    batch: async input => input.writes.map(write => refuse(write.reference)).find(refused => refused !== null) ?? store.batch(input),
    history: async input => refuse(input.reference) ?? store.history(input),
    pull: async input => {
      if (input?.history?.includes(history) !== true) return store.pull(input);
      held = true;
      return { status: "ok", result: PullResultSchema.parse({ states: [], pulls: [{ status: "pulled", role: "state",
        remote: "origin", families: ["work-item"], notices: [] }] }) };
    } };
}
