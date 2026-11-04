/** Overlay one pending content write on the store's read-only view. */
import { familyOf } from "../catalog.js";
import { RecordVersionSchema, recordReferences, sameOwner, sameReference, type RecordReference } from "../identity.js";
import type { ListInput, StoreRecord } from "../read.js";
import { KIND_REGISTRY } from "../registry.js";
import type { StoreResult } from "../refusal.js";
import type { StoreView, WriteCheckInput } from "../write-check.js";

/** Pending parsed content and the prior envelope, if this record already exists. */
export interface WriteBackAfterInput {
  readonly before: StoreView;
  readonly reference: RecordReference;
  readonly next: NonNullable<WriteCheckInput["next"]>;
  readonly prior?: StoreRecord;
}

/** Answer the pending record from caller-parsed content; retain every other observation. */
export function createWriteBackAfterView(input: WriteBackAfterInput): StoreView {
  let pending: Promise<StoreResult<StoreRecord>> | undefined;
  const record = () => pending ??= pendingRecord(input);
  return {
    read: async query => query.asOf === undefined && sameReference(query.reference, input.reference)
      ? record() : input.before.read(query),
    list: async query => {
      const listed = await input.before.list(query);
      if (listed.status === "refused" || listed.result.status === "unreadable"
        || query.asOf !== undefined || !matches(query, input.reference)) return listed;
      const next = await record();
      if (next.status === "refused") return next;
      if (!matchesLocation(query, next.result)) return listed;
      const prior = listed.result;
      if (prior.status === "absent") return { status: "ok", result: { ...prior, status: "complete",
        records: [next.result], diagnostics: [], missed: false } };
      const position = prior.records.findIndex(each => sameReference(each.reference, input.reference));
      const records = prior.records.map((each, index) => index === position ? next.result : each);
      if (position === -1) records.push(next.result);
      return { status: "ok", result: { ...prior, records } };
    },
    lookup: query => input.before.lookup(query),
  };
}

function matches(query: ListInput, reference: RecordReference): boolean {
  return query.family === familyOf(reference.kind) && (query.kind === undefined || query.kind === reference.kind)
    && (query.owner === undefined || sameOwner(query.owner, reference.owner)
      || (query.owner.type === reference.owner.type && query.owner.type !== "person" && query.owner.uid === undefined
        && query.owner.name === reference.owner.name));
}

function matchesLocation(query: ListInput, record: StoreRecord): boolean {
  const location = record.placement?.kind === "backlog" ? record.placement.commitment : record.placement?.kind;
  return query.filter?.locations === undefined || (location !== undefined && query.filter.locations.includes(location));
}

async function pendingRecord(input: WriteBackAfterInput): Promise<StoreResult<StoreRecord>> {
  if (input.prior !== undefined) return { status: "ok", result: { ...input.prior, ...input.next } };
  const reference = input.reference;
  if (reference.kind === "work-item/meta" || reference.kind === "work-item/record" || reference.kind === "cohort/document") {
    throw new Error("Write-back cannot create a primary or cohort record");
  }
  const record: StoreRecord = { reference, ...input.next, version: RecordVersionSchema.parse("projection:pending"),
    formatVersion: KIND_REGISTRY[reference.kind].formatVersion, conflicts: [] };
  if (reference.owner.type !== "work-item") return { status: "ok", result: record };
  const owner = await input.before.read({ reference: recordReferences["work-item/meta"](reference.owner) });
  if (owner.status === "refused") return owner;
  return { status: "ok", result: { ...record, placement: owner.result.placement } };
}
