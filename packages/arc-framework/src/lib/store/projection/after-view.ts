/** Overlay one pending content write on the store's read-only view. */
import { familyOf } from "../catalog.js";
import { RecordReferenceSchema, RecordVersionSchema, recordReferences, sameOwner, sameReference, type OwnerIdentity, type RecordReference } from "../identity.js";
import type { ListInput, ReadInput, StoreRecord } from "../read.js";
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
    read: query => readAfter(input, query, record),
    list: async query => {
      const listed = await input.before.list(query);
      if (listed.status === "refused" || listed.result.status === "unreadable"
        || query.asOf !== undefined || !matches(query, input.reference)) return listed;
      if (!await matchesOwner(input, query.owner)) return listed;
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

async function readAfter(input: WriteBackAfterInput, query: ReadInput,
  pending: () => Promise<StoreResult<StoreRecord>>): Promise<StoreResult<StoreRecord>> {
  if (query.asOf !== undefined) return input.before.read(query);
  if (sameReference(query.reference, input.reference)) return pending();
  const read = await input.before.read(query);
  if (read.status === "ok") return sameReference(read.result.reference, input.reference) ? pending() : read;
  if (read.refusal.code !== "not-found" || input.prior !== undefined || query.reference.kind !== input.reference.kind) return read;
  const owner = query.reference.owner;
  if (owner.type === "person" || owner.uid !== undefined) return read;
  const resolved = await input.before.read({ reference: ownerReference(owner) });
  if (resolved.status === "refused") return read;
  const reference = RecordReferenceSchema.parse({ ...query.reference, owner: resolved.result.reference.owner });
  return sameReference(reference, input.reference) ? pending() : read;
}

function matches(query: ListInput, reference: RecordReference): boolean {
  return query.family === familyOf(reference.kind) && (query.kind === undefined || query.kind === reference.kind);
}

async function matchesOwner(input: WriteBackAfterInput, owner: OwnerIdentity | undefined): Promise<boolean> {
  if (owner === undefined || sameOwner(owner, input.reference.owner)) return true;
  if (owner.type === "person" || owner.uid !== undefined || owner.type !== input.reference.owner.type) return false;
  const read = await input.before.read({ reference: RecordReferenceSchema.parse({ ...input.reference, owner }) });
  if (read.status === "ok") return sameReference(read.result.reference, input.reference);
  if (read.refusal.code !== "not-found") return false;
  const resolved = await input.before.read({ reference: ownerReference(owner) });
  return resolved.status === "ok" && sameOwner(resolved.result.reference.owner, input.reference.owner);
}

function ownerReference(owner: Exclude<OwnerIdentity, { type: "person" }>): RecordReference {
  if (owner.type === "work-item") return recordReferences["work-item/meta"](owner);
  if (owner.type === "cohort") return recordReferences["cohort/document"](owner);
  return recordReferences["project-registry/identity"](owner);
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
