/** In-memory durable state and canonical reference keys used only by contract tests. */

import { randomUUID } from "node:crypto";
import {
  OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema, StateVersionSchema,
  referenceOwner, referenceKind, referenceKey, sameOwner, sameReference,
  type OwnerIdentity, type RecordReference, type RecordVersion, type StateVersion,
  type ReadPlacement, type Links, type StoredProvenance, type ConflictRecord, type FamilyId, type SideLabel,
} from "../../../src/lib/store/index.js";

/** One saved record, including backend metadata kept outside its content. */
export interface MemoryRecord {
  reference: RecordReference;
  content: string;
  version: RecordVersion;
  formatVersion: number;
  fields?: unknown;
  formerSlugs: string[];
  placement?: ReadPlacement;
  links?: Links;
  conflict?: ConflictRecord;
  label: { actor: string; time: string };
}

/** One landed write in the event stream, removals included. */
export interface MemoryEvent {
  id: string;
  reference: RecordReference;
  version?: RecordVersion;
  stateVersion: StateVersion;
  provenance: StoredProvenance;
  label: SideLabel;
}

/** A bad entry deliberately planted below the contract's validation boundary. */
export interface MemoryFault {
  reference: RecordReference;
  kind: "unreadable" | "oversized" | "malformed" | "identity-mismatch" | "unknown-format-version";
  actual?: RecordReference;
}

/** Shared local state; reopening reuses this object without replay or delayed persistence. */
export interface MemoryState {
  records: Map<string, MemoryRecord>;
  snapshots: Map<StateVersion, Map<string, MemoryRecord>>;
  identities: Map<string, OwnerIdentity>;
  events: MemoryEvent[];
  faults: Map<string, MemoryFault>;
  unreadable: Set<FamilyId>;
  locks: Set<string>;
  archiveSequences: Map<string, number>;
  counter: number;
  corrupt: boolean;
}

/** Return a new empty durable namespace.
 * @returns Independently owned maps with an initial saved state.
 */
export function createMemoryState(): MemoryState {
  return {
    records: new Map(), snapshots: new Map([[StateVersionSchema.parse("state:0"), new Map()]]),
    identities: new Map(), events: [], faults: new Map(), unreadable: new Set(), locks: new Set(),
    archiveSequences: new Map(), counter: 0, corrupt: false,
  };
}

/** Return a name-based key for resolving an unminted owner.
 * @param owner - Caller or backend identity.
 * @returns Its namespace-qualified human handle.
 */
export function ownerNameKey(owner: { type: OwnerIdentity["type"]; name: string }): string { return `${owner.type}:${owner.name}`; }

/** Return a stable record identity, independent of a UID-bearing owner's rename.
 * @param reference - Opaque reference built through the contract.
 * @returns A collision-free composite storage key.
 */
export function recordKey(reference: RecordReference): string {
  const owner = referenceOwner(reference);
  const ownerId = owner.type === "person" ? owner.name : owner.uid ?? owner.name;
  const kind = referenceKind(reference);
  const identityKind = owner.type === "work-item" && owner.uid !== undefined
    && ["work-item/meta", "work-item/record"].includes(kind) ? "work-item/primary" : kind;
  return JSON.stringify([owner.type, ownerId, identityKind, referenceKey(reference) ?? null]);
}

/** Recover accepted rename handles from this generation's records and saved primary states.
 * @param state - Namespace, including published conflicts carrying owner alias metadata.
 * @param reference - Exact record generation being preserved or restored.
 * @returns Earlier handles belonging only to that owner generation.
 */
export function generationAliases(state: MemoryState, reference: RecordReference): string[] {
  const key = recordKey(reference);
  const names = [...state.records.values()].filter((record) => sameOwner(record.reference.owner, reference.owner))
    .flatMap((record) => record.formerSlugs);
  for (const snapshot of state.snapshots.values()) {
    const record = snapshot.get(key);
    if (record !== undefined) names.push(...record.formerSlugs, record.reference.owner.name);
  }
  return [...new Set(names.filter((name) => name !== reference.owner.name))];
}

/** Resolve a reference's owner, minting random generation IDs only when asked to create.
 * @param state - Shared local namespace.
 * @param reference - Caller reference, possibly still addressed by slug.
 * @param create - Whether an unknown owner's first write should mint its identity.
 * @returns A canonical reference whose UID survives later renames.
 */
export function canonicalReference(state: MemoryState, reference: RecordReference, create = false): RecordReference {
  const owner = referenceOwner(reference);
  if (owner.type === "person" || owner.uid !== undefined) return reference;
  let resolved = state.identities.get(ownerNameKey(owner));
  if (resolved === undefined && create) {
    const minted = OwnerIdentitySchema.parse({ ...owner, uid: randomUUID() });
    resolved = minted;
    state.identities.set(ownerNameKey(owner), minted);
  }
  return resolved === undefined ? reference : RecordReferenceSchema.parse({ ...reference, owner: resolved });
}

/** Resolve a UID-less historical handle using only identities present in its selected saved state.
 * @param records - Records of the requested saved state, excluding later aliases and generations.
 * @param reference - Caller reference, possibly still addressed by name.
 * @returns A canonical generation known to that state, or the unmatched caller handle.
 */
export function savedReference(records: Map<string, MemoryRecord>, reference: RecordReference): RecordReference {
  if (reference.owner.type === "person" || reference.owner.uid !== undefined) return reference;
  const matches = [...records.values()].filter((record) => record.reference.owner.type === reference.owner.type
    && (record.reference.owner.name === reference.owner.name || record.formerSlugs.includes(reference.owner.name))
    && sameReference(record.reference, { ...reference, owner: record.reference.owner }));
  const record = matches.find((record) => record.placement?.kind !== "completed") ?? matches[0];
  return record === undefined ? reference : record.reference;
}

/** Read the namespace's opaque current saved state.
 * @param state - Shared local namespace.
 * @returns A version callers compare only for equality.
 */
export function currentStateVersion(state: MemoryState): StateVersion { return StateVersionSchema.parse(`state:${state.counter}`); }

/** Retain the highest completed allocation observed through reconciliation.
 * @param state - Receiving namespace, including its durable allocation counters.
 * @param record - Imported or published record whose placement has been saved.
 * @returns Nothing; the namespace retains the observed allocation.
 */
export function observeArchivePlacement(state: MemoryState, record: MemoryRecord): void {
  const placement = record.placement;
  if (record.reference.kind !== "work-item/meta" || placement?.kind !== "completed" || !("sequence" in placement)) return;
  state.archiveSequences.set(placement.quarter,
    Math.max(state.archiveSequences.get(placement.quarter) ?? 0, Number(placement.sequence)));
}

/** Allocate record and state versions; the caller saves its state after applying the write.
 * @param state - Shared local namespace receiving the write.
 * @returns Its new record and state versions.
 */
export function advanceMemoryState(state: MemoryState): { version: RecordVersion; stateVersion: StateVersion } {
  state.counter += 1;
  const stateVersion = currentStateVersion(state);
  return { version: RecordVersionSchema.parse(`record:${state.counter}:${randomUUID()}`), stateVersion };
}
