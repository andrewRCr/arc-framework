/** Pure admission rules for kind-declared writers and explicit conflict removals. */

import type { Mutation } from "../write.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { sameReference, type RecordReference } from "../identity.js";

/** Refuse a mutation issued outside its kind's declared writer authority. */
export function checkRefWriterRules(mutation: Mutation, verb: string,
  registry: RefBackendContext["registry"], namesResolved = false): StoreRefusal | undefined {
  const definition = registry[mutation.reference.kind];
  if (definition.writerRule === "write-once" && !definition.writerVerbs?.includes(verb)) return {
    code: "record-malformed", class: "recoverable", reference: mutation.reference, rule: "store.writer",
    condition: "This write-once record may only be changed by its declared writer verbs.",
    remedy: { text: "Use one of this kind's declared writer verbs, then retry the mutation." },
  };
  if (mutation.action === "remove" && mutation.reference.kind.endsWith("/conflict-record")
    && !mutation.resolves?.some((reference) => namesResolved ? sameReference(reference, mutation.reference)
      : couldResolveSelf(reference, mutation.reference))) return {
    code: "record-malformed", class: "recoverable", reference: mutation.reference, rule: "store.resolves",
    condition: "Removing a conflict record requires explicitly naming it in resolves.",
    remedy: { text: "Name this conflict in resolves and remove it against its current version, or write its subject naming the conflict." },
  };
  return undefined;
}

function couldResolveSelf(left: RecordReference, right: RecordReference): boolean {
  if (sameReference(left, right)) return true;
  if (left.owner.type !== right.owner.type || left.owner.type === "person" || right.owner.type === "person") return false;
  // A UID handle's display name can be obsolete; the shared namespace read settles mixed handles.
  if ((left.owner.uid === undefined) === (right.owner.uid === undefined)) return false;
  return sameReference({ ...left, owner: right.owner }, right);
}
