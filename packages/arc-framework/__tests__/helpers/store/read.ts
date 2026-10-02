/** Reference reads, completeness-preserving listings, and saved-state history queries. */

import {
  FAMILY_REGISTRY, familyOf, sameOwner, type ChangesInput, type HistoryEntry, type ListInput,
  type ListingDiagnostic, type ListingOutcome, type ReadInput, type RecordReference,
  type StateVersion, type StoreRecord, type StoreResult,
} from "../../../src/lib/store/index.js";
import type { ReferenceContext } from "./context.js";
import { canonicalReference, currentStateVersion, ownerNameKey, recordKey, savedReference, type MemoryRecord } from "./model.js";
import { malformed, missingRecord, namespaceAdmission, ok, recordAdmission, refused } from "./refusals.js";

function recordsAt(context: ReferenceContext, asOf?: StateVersion): Map<string, MemoryRecord> {
  if (asOf === undefined) return context.state.records;
  const snapshot = context.state.snapshots.get(asOf);
  if (snapshot === undefined) throw new Error(`Unknown reference state version ${asOf}`);
  return snapshot;
}

/** Build public bytes and metadata while preserving the owner's primary placement.
 * @param context - Registry and shared namespace.
 * @param record - The record found in the selected state.
 * @param records - All records in that same state.
 * @returns The path-free contract record.
 */
export function publicRecord(context: ReferenceContext, record: MemoryRecord, records = context.state.records): StoreRecord {
  const conflicts = [...records.values()].filter((candidate) => candidate.conflict
    && recordKey(candidate.conflict.record) === recordKey(record.reference)).map((candidate) => candidate.reference);
  const primary = [...records.values()].find((candidate) => sameOwner(candidate.reference.owner, record.reference.owner)
    && (candidate.reference.kind === "work-item/meta" || candidate.reference.kind === "work-item/record"));
  const placement = ["work-item", "review"].includes(familyOf(record.reference.kind)) ? primary?.placement ?? record.placement : record.placement;
  const parsed = context.registry[record.reference.kind].parser?.(record.content);
  return {
    reference: record.reference, content: record.content, version: record.version,
    formatVersion: record.formatVersion, conflicts,
    ...(parsed?.success ? { fields: parsed.data } : {}),
    ...(placement === undefined ? {} : { placement }), ...(record.links === undefined ? {} : { links: record.links }),
  };
}

/** Read exactly the requested saved record; newer format metadata is an actionable refusal.
 * @param context - Shared local dependencies.
 * @param input - Reference and optional saved state.
 * @returns Bytes and metadata, or a classified local refusal.
 */
export function readReference(context: ReferenceContext, input: ReadInput): StoreResult<StoreRecord> {
  const admission = input.asOf === undefined ? recordAdmission(context.state, input.reference, context.environment.identity)
    : namespaceAdmission(context.state) ?? (input.reference.owner.type === "person" && context.environment.identity === undefined ? missingRecord(input.reference, context.environment.identity) : undefined);
  if (admission) return refused(admission);
  const records = recordsAt(context, input.asOf);
  const reference = input.asOf === undefined ? canonicalReference(context.state, input.reference) : savedReference(records, input.reference);
  const record = records.get(recordKey(reference));
  if (record === undefined) return refused(missingRecord(input.reference, context.environment.identity));
  const newer = record.formatVersion > context.registry[reference.kind].formatVersion;
  if (newer) return refused(malformed(reference, "Stored format version is newer than this build supports.", "newer-format"));
  return ok(publicRecord(context, record, records));
}

function diagnostic(reference: RecordReference, kind: ListingDiagnostic["kind"]): ListingDiagnostic {
  return { kind, key: recordKey(reference), condition: `Stored entry is ${kind}.`, remedy: { text: `Repair the ${kind} entry, then list the family again.` } };
}

function listedLocation(record: StoreRecord): string | undefined {
  return record.placement?.kind === "backlog" ? record.placement.commitment : record.placement?.kind;
}

/** Enumerate every good entry and diagnostic while keeping missing families distinct.
 * @param context - Registry, identity, and durable namespace.
 * @param input - Family, optional kind/owner/lifecycle filter, and saved-state anchor.
 * @returns Absent, unreadable or complete enumeration in the common envelope.
 */
export function listReference(context: ReferenceContext, input: ListInput): StoreResult<ListingOutcome> {
  const admission = namespaceAdmission(context.state);
  if (admission) return refused(admission);
  if (input.filter?.heldHere) return refused({
    code: "unsupported", case: "held-here", class: "recoverable",
    condition: "State lives off the checkout branch, so this store cannot identify held-here records.",
    remedy: { text: "Use lookup with the checkout's claim, or list without the held-here filter." },
  });
  const asOf = input.asOf ?? currentStateVersion(context.state);
  if (FAMILY_REGISTRY[input.family].scope === "identity" && context.environment.identity === undefined) return ok({ status: "absent", asOf });
  if (input.asOf === undefined && context.state.unreadable.has(input.family)) return ok({
    status: "unreadable", condition: "The family index cannot be read.", remedy: { text: "Restore the family index from a saved state." },
  });
  const saved = recordsAt(context, input.asOf);
  const owner = input.owner && (input.asOf === undefined && input.owner.type !== "person" && input.owner.uid === undefined
    ? context.state.identities.get(ownerNameKey(input.owner)) ?? input.owner : input.owner);
  const selected = [...saved.values()].filter((record) => familyOf(record.reference.kind) === input.family
    && (input.kind === undefined || record.reference.kind === input.kind)
    && (owner === undefined || sameOwner(record.reference.owner, owner)
      || (owner.type !== "person" && owner.uid === undefined && record.reference.owner.type === owner.type && record.reference.owner.name === owner.name)));
  const records: StoreRecord[] = [];
  const diagnostics: ListingDiagnostic[] = [];
  for (const record of selected) {
    const fault = input.asOf === undefined ? context.state.faults.get(recordKey(record.reference)) : undefined;
    const parsed = context.registry[record.reference.kind].parser?.(record.content);
    const kind = fault?.kind === "identity-mismatch" ? "key-mismatch" : fault?.kind
      ?? (record.formatVersion > context.registry[record.reference.kind].formatVersion ? "unknown-format-version" : parsed?.success === false ? "malformed" : undefined);
    if (kind !== undefined) { diagnostics.push(diagnostic(record.reference, kind)); continue; }
    const value = publicRecord(context, record, saved);
    if (input.filter?.locations === undefined || input.filter.locations.includes(listedLocation(value) as never)) records.push(value);
  }
  return selected.length === 0 ? ok({ status: "absent", asOf })
    : ok({ status: "complete", records, diagnostics, missed: diagnostics.length > 0, asOf });
}

/** Return newest-first provenance for one stable generation, removals included.
 * @param context - Durable event stream.
 * @param reference - Record generation and kind.
 * @returns Every version of the record in newest-first order.
 */
export function historyReference(context: ReferenceContext, reference: RecordReference): HistoryEntry[] {
  const key = recordKey(canonicalReference(context.state, reference));
  return context.state.events.filter((event) => recordKey(event.reference) === key).reverse()
    .map((event) => ({ reference: event.reference, version: event.version ?? null, provenance: event.provenance }));
}

/** Read bounded changes by equality against saved-state anchors, never whole-store freshness.
 * @param context - Durable snapshots and events.
 * @param input - Exclusive from, inclusive to, and optional record restriction.
 * @returns Provenance for exactly the landed mutations in the requested interval.
 */
export function changesReference(context: ReferenceContext, input: ChangesInput): HistoryEntry[] {
  const states = [...context.state.snapshots.keys()];
  const from = states.indexOf(input.from);
  const to = states.indexOf(input.to);
  if (from < 0 || to < from) throw new Error("Invalid reference changes interval");
  const included = new Set(states.slice(from + 1, to + 1));
  const restricted = input.references?.map((reference) => recordKey(canonicalReference(context.state, reference)));
  return context.state.events.filter((event) => included.has(event.stateVersion)
    && (context.environment.identity !== undefined || FAMILY_REGISTRY[familyOf(event.reference.kind)].scope !== "identity")
    && (restricted === undefined || restricted.includes(recordKey(event.reference))))
    .map((event) => ({ reference: event.reference, version: event.version ?? null, provenance: event.provenance }));
}
