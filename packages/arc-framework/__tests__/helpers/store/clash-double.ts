/** Concurrent holder observations over real records whose mutation identities stay unchanged. */
import type { Store } from "../../../src/lib/store/contract.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../../../src/lib/store/identity.js";

/** Project two live records onto one slug, optionally introducing the clash after the first lookup. */
export function createClashDouble(store: Store, input: {
  slug: string;
  holders: readonly [RecordReference, RecordReference];
  mode?: "clash" | "mid-verb";
}): Store {
  const wrapped = Object.create(store) as Store;
  const project = (reference: RecordReference) => RecordReferenceSchema.parse({ ...reference,
    owner: { ...reference.owner, name: input.slug } });
  wrapped.list = async query => {
    const result = await store.list(query);
    if (query.family !== "work-item" || query.kind !== "work-item/meta" || query.owner !== undefined
      || result.status !== "ok" || result.result.status !== "complete") return result;
    const records = result.result.records.filter(record => input.mode !== "mid-verb" || !sameReference(record.reference, input.holders[1]))
      .map(record => input.holders.some(reference => sameReference(record.reference, reference))
        ? { ...record, reference: project(record.reference) } : record);
    return { status: "ok", result: { ...result.result, records } };
  };
  let lookups = 0;
  wrapped.lookup = async query => {
    if (query.kind !== "slug" || query.slug !== input.slug) return store.lookup(query);
    if (input.mode === "mid-verb" && lookups++ === 0) return { status: "ok", result: { reference: input.holders[0] } };
    return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
      candidates: input.holders.map(project), tie: { liveness: "live", name: "current" },
      condition: "The lookup matches more than one record generation.",
      remedy: { text: "Disambiguate the stored names or links, then repeat the lookup." } } };
  };
  return wrapped;
}
