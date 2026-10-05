/** The backend-independent operational state contract. */

import { z } from "zod";
import { RecordReferenceSchema, RecordVersionSchema, StateVersionSchema, type RecordReference, type StateVersion } from "./identity.js";
import { StoredProvenanceSchema } from "./links.js";
import type { LookupInput, LookupResult } from "./lookup.js";
import type { ListingOutcome, ListInput, ReadInput, StoreCapabilities, StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import type { SyncResult } from "./sync.js";
import type { BatchInput, BatchResult, WriteInput, WriteResult } from "./write.js";

/** Record history input. */
export const HistoryInputSchema = z.strictObject({ reference: RecordReferenceSchema });
/** Changes between saved states, optionally bound to named records. */
export const ChangesInputSchema = z.strictObject({ from: StateVersionSchema, to: StateVersionSchema, references: z.array(RecordReferenceSchema).optional() });
/** Exact landed record content and provenance; removals pair null version and content. */
export const HistoryEntrySchema = z.strictObject({ reference: RecordReferenceSchema, version: RecordVersionSchema.nullable(), content:z.string().nullable(), provenance: StoredProvenanceSchema })
  .refine((entry)=>(entry.version === null) === (entry.content === null),"Removal pairs null content with a null version");
/** One history or change entry. */
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
/** A scoped state change query. */
export type ChangesInput = z.infer<typeof ChangesInputSchema>;

/** All backend operations share one envelope and preserve exact record references. */
export interface Store {
  /** The only backend distinction callers may inspect. */
  readonly capabilities: StoreCapabilities;
  /** Read bytes and optional parsed fields by reference. */
  read(input: ReadInput): Promise<StoreResult<StoreRecord>>;
  /** Enumerate one family without erasing incomplete evidence. */
  list(input: ListInput): Promise<StoreResult<ListingOutcome>>;
  /** Apply or merge one expected-version mutation. */
  write(input: WriteInput): Promise<StoreResult<WriteResult>>;
  /** Apply every requested mutation or none. */
  batch(input: BatchInput): Promise<StoreResult<BatchResult>>;
  /** Return the current saved state anchor. */
  version(): Promise<StoreResult<StateVersion>>;
  /** Return newest-first record versions with their exact content and provenance. */
  history(input: { reference: RecordReference }): Promise<StoreResult<HistoryEntry[]>>;
  /** Return landed content, versions and provenance for records changed between two anchors. */
  changes(input: ChangesInput): Promise<StoreResult<HistoryEntry[]>>;
  /** Resolve human handles, lineage, claims, and code links. */
  lookup(input: LookupInput): Promise<StoreResult<LookupResult>>;
  /** Publish every eligible family and retain independent failures. */
  sync(): Promise<StoreResult<SyncResult>>;
}
