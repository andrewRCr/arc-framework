/** Concurrent holder observations over real records whose mutation identities stay unchanged. */
import type { Store } from "../../../src/lib/store/contract.js";
import { RecordReferenceSchema, sameOwner, sameReference, type RecordReference } from "../../../src/lib/store/identity.js";

/** Project two live records onto one slug, optionally introducing the clash after the first lookup. */
export function createClashDouble(store: Store, input: {
  slug: string;
  holders: readonly [RecordReference, RecordReference];
  mode?: "clash" | "mid-verb";
}): Store {
  const wrapped = Object.create(store) as Store;
  const project = (reference: RecordReference) => RecordReferenceSchema.parse({ ...reference,
    owner: { ...reference.owner, name: input.slug } });
  const holderFor = (uid?: string) => uid === undefined ? undefined : input.holders.find(reference =>
    reference.owner.type === "work-item" && reference.owner.uid === uid);
  const underlying = (reference: RecordReference) => {
    const holder = reference.owner.type === "work-item" ? holderFor(reference.owner.uid) : undefined;
    return holder === undefined || reference.owner.name !== input.slug ? reference
      : RecordReferenceSchema.parse({ ...reference, owner: holder.owner });
  };
  wrapped.write = query => store.write({ ...query, reference: underlying(query.reference) });
  wrapped.batch = query => store.batch({ ...query,
    writes: query.writes.map(write => ({ ...write, reference: underlying(write.reference) })),
    ...(query.observations === undefined ? {} : { observations: query.observations.map(observation =>
      ({ ...observation, reference: underlying(observation.reference) })) }),
  });
  wrapped.read = async query => {
    const holder = query.reference.owner.type === "work-item" ? holderFor(query.reference.owner.uid) : undefined;
    if (holder === undefined) return store.read(query);
    const result = await store.read({ ...query, reference: RecordReferenceSchema.parse({ ...query.reference, owner: holder.owner }) });
    return result.status === "ok" ? { status: "ok", result: { ...result.result, reference: project(result.result.reference) } } : result;
  };
  wrapped.list = async query => {
    const result = await store.list(query);
    if (query.family !== "work-item" || result.status !== "ok" || result.result.status !== "complete") return result;
    if (query.owner !== undefined) {
      const records = result.result.records.map(record => input.holders.some(reference => sameOwner(reference.owner, record.reference.owner))
        ? { ...record, reference: project(record.reference) } : record);
      return { status: "ok", result: { ...result.result, records } };
    }
    if (query.kind !== "work-item/meta") return result;
    const records = result.result.records.filter(record => input.mode !== "mid-verb" || !sameReference(record.reference, input.holders[1]))
      .map(record => input.holders.some(reference => sameReference(record.reference, reference))
        ? { ...record, reference: project(record.reference) } : record);
    return { status: "ok", result: { ...result.result, records } };
  };
  let lookups = 0;
  wrapped.lookup = async query => {
    if (query.kind === "claim" && query.claim.kind === "work-unit") {
      const holder = holderFor(query.claim.uid);
      if (holder !== undefined) return { status: "ok", result: { reference: project(holder) } };
    }
    if (query.kind !== "slug" || query.slug !== input.slug) return store.lookup(query);
    if (input.mode === "mid-verb" && lookups++ === 0) return { status: "ok", result: { reference: input.holders[0] } };
    return { status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
      candidates: input.holders.map(project), tie: { liveness: "live", name: "current" },
      condition: "The lookup matches more than one record generation.",
      remedy: { text: "Disambiguate the stored names or links, then repeat the lookup." } } };
  };
  return wrapped;
}
