/** Identity-based lifecycle queries over the public storage contract. */
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { validateState, validatePriority } from "../kernel/schema/vocabulary.js";
import type { Phase, Location } from "../work-unit/lifecycle-state.js";
import type { Store } from "./contract.js";
import type { OwnerIdentity, RecordReference, RecordVersion, StateVersion } from "./identity.js";
import type { ListingOutcome, ListingDiagnostic, StoreRecord } from "./read.js";
import type { ReadPlacement } from "./placement.js";
import type { StoreResult } from "./refusal.js";
import type { LookupInput, LookupResult } from "./lookup.js";

/** One selected work unit, retaining parsed fields and exact record identity without a path. */
export interface LifecycleEntry {
  reference: RecordReference;
  version: RecordVersion;
  fields: ParsedMetaRecord;
  placement: ReadPlacement;
  phase: Phase;
  location: Location;
}
/** Identity lookup and iteration over independently selected work units. */
export interface IdentityLifecycleIndex {
  entries(): readonly LifecycleEntry[];
  get(owner: OwnerIdentity): LifecycleEntry | undefined;
}
/** Completeness evidence remains identical to the meta listing that supplied the index. */
export type LifecycleIndexOutcome = Exclude<ListingOutcome, { status: "complete" }> | {
  status: "complete";
  index: IdentityLifecycleIndex;
  diagnostics: ListingDiagnostic[];
  missed: boolean;
  asOf?: StateVersion;
};
/** Optional saved-state anchor shared by selected and held queries. */
export interface LifecycleIndexInput { asOf?: StateVersion }
/** Build selected lifecycle records from the public meta listing.
 * @param store - Contract implementation.
 * @param input - Optional saved-state anchor.
 * @returns Indexed fields and original listing completeness evidence.
 */
export async function listLifecycleIndex(store: Store, input: LifecycleIndexInput = {}): Promise<StoreResult<LifecycleIndexOutcome>> {
  return indexedListing(await store.list({ family: "work-item", kind: "work-item/meta", ...input }));
}
/** Build the interim checkout's own lifecycle records.
 * @param store - Contract implementation.
 * @param input - Optional saved-state anchor.
 * @returns Held records or the store's held-here refusal.
 */
export async function listHeldLifecycleIndex(store: Store, input: LifecycleIndexInput = {}): Promise<StoreResult<LifecycleIndexOutcome>> {
  return indexedListing(await store.list({ family: "work-item", kind: "work-item/meta", filter: { heldHere: true }, ...input }));
}
/** Compare the selected copy with this checkout's semantically agreeing copy.
 * @param store - Contract implementation.
 * @param input - Work-unit reference and optional saved-state anchor.
 * @returns Agreement, without granting write admission.
 */
export async function isLifecycleSelectedHere(store: Store, input: LifecycleIndexInput & { reference: RecordReference }): Promise<StoreResult<boolean>> {
  const anchor = input.asOf === undefined ? {} : { asOf: input.asOf };
  const held = await listHeldLifecycleIndex(store, anchor);
  if (held.status === "refused") return held;
  const selected = await listLifecycleIndex(store, anchor);
  if (selected.status === "refused") return selected;
  const owner = input.reference.owner;
  const localEntry = held.result.status === "complete" ? held.result.index.get(owner) : undefined;
  const selectedEntry = selected.result.status === "complete" ? selected.result.index.get(owner) : undefined;
  return { status: "ok", result: localEntry !== undefined && selectedEntry !== undefined
    && JSON.stringify(agreement(localEntry)) === JSON.stringify(agreement(selectedEntry)) };
}
/** Resolve transition origins and checkout claims through the contract.
 * @param store - Contract implementation.
 * @param input - Origin or checkout claim.
 * @returns The store's exact resolution or refusal.
 */
export function lookupLifecycle(store: Store, input: Extract<LookupInput, { kind: "lineage" | "claim" }>): Promise<StoreResult<LookupResult>> {
  return store.lookup(input);
}

function indexedListing(result: StoreResult<ListingOutcome>): StoreResult<LifecycleIndexOutcome> {
  if (result.status === "refused") return result;
  if (result.result.status !== "complete") return { status: "ok", result: result.result };
  const { records, ...evidence } = result.result;
  const entries = records.flatMap((record) => { const entry = lifecycleEntry(record); return entry === undefined ? [] : [entry]; });
  const byIdentity = new Map(entries.map((entry) => [identityKey(entry.reference.owner), entry]));
  const index: IdentityLifecycleIndex = {
    entries: () => [...byIdentity.values()],
    get: (owner) => byIdentity.get(identityKey(owner)),
  };
  return { status: "ok", result: { ...evidence, index } };
}
function identityKey(owner: OwnerIdentity): string {
  return JSON.stringify([owner.type, owner.type !== "person" && owner.uid !== undefined ? ["uid", owner.uid] : ["name", owner.name]]);
}
function lifecycleEntry(record: StoreRecord): LifecycleEntry | undefined {
  if (record.reference.kind !== "work-item/meta" || record.placement === undefined) return undefined;
  try {
    const decoded = ParsedMetaRecordSchema.safeParse(record.fields);
    const fields = decoded.success ? decoded.data : parseMetaRecord(record.content);
    const phase = validateState(fields.state);
    if (phase === "unknown") return undefined;
    const placement = record.placement;
    const location = placement.kind === "backlog" ? placement.commitment : placement.kind;
    return { reference: record.reference, version: record.version, fields, placement, phase, location };
  } catch { return undefined; }
}
function agreement(entry: LifecycleEntry): object {
  const fields = entry.fields;
  return {
    slug: entry.reference.owner.name,
    state: entry.phase,
    owner: fields.owner,
    priority: validatePriority(fields.priority),
    cohort: fields.cohort,
    dependsOn: [...new Set(fields.dependsOn)].sort(),
    placement: entry.placement,
  };
}
