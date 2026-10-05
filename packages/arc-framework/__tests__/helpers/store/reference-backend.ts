/** Test-only, Git-free implementation of the whole operational state contract. */

import type {
  BatchInput, BatchResult, ChangesInput, HistoryEntry, ListInput, ListingOutcome, LookupInput,
  LookupResult, ReadInput, RecordReference, StateVersion, Store, StoreRecord, StoreResult,
  SyncResult, WriteInput, WriteResult,
} from "../../../src/lib/store/index.js";
import { currentStateVersion, type MemoryState } from "./model.js";
import { missingRecord, namespaceAdmission, ok, refused } from "./refusals.js";
import { createReferenceContext, type ReferenceBackendOptions, type ReferenceContext, type ReferenceEnvironment } from "./context.js";
import { changesReference, historyReference, listReference, readReference } from "./read.js";
import { batchReference, writeReference } from "./write.js";
import { lookupReference } from "./lookup.js";
import { syncReference } from "./sync.js";

/** Runtime configuration shared by reopened instances and the in-memory remote. */
export type { ReferenceEnvironment, ReferenceBackendOptions } from "./context.js";

/** Whole-contract memory backend; its shared state is durable at method return. */
export class ReferenceBackend implements Store {
  readonly capabilities = { stateOffBranch: true } as const;
  readonly state: MemoryState;
  readonly environment: ReferenceEnvironment;
  readonly context: ReferenceContext;

  /** Open a new or existing independently owned memory namespace.
   * @param options - Optional shared state and injected identity/clock.
   */
  constructor(options: ReferenceBackendOptions = {}) {
    this.context = createReferenceContext(options);
    this.state = this.context.state;
    this.environment = this.context.environment;
  }

  /** Read bytes, metadata and open conflict references from the selected saved state. */
  async read(input: ReadInput): Promise<StoreResult<StoreRecord>> {
    return readReference(this.context, input);
  }

  /** Enumerate a family with complete diagnostics and exact per-record mutation bases. */
  async list(input: ListInput): Promise<StoreResult<ListingOutcome>> { return listReference(this.context, input); }

  /** Compare-and-swap or merge a write under its surface's injected machine lock. */
  async write(input: WriteInput): Promise<StoreResult<WriteResult>> {
    return writeReference(this.context, input);
  }

  /** Preflight every mutation before publishing the complete atomic result. */
  async batch(input: BatchInput): Promise<StoreResult<BatchResult>> {
    return batchReference(this.context, input);
  }

  /** Return the current saved state without advancing it. */
  async version(): Promise<StoreResult<StateVersion>> {
    const refusal = namespaceAdmission(this.state);
    return refusal ? refused(refusal) : ok(currentStateVersion(this.state));
  }

  /** Return one record's newest-first mutation stream across renames. */
  async history(input: { reference: RecordReference }): Promise<StoreResult<HistoryEntry[]>> {
    const refusal = namespaceAdmission(this.state)
      ?? (input.reference.owner.type === "person" && this.environment.identity === undefined ? missingRecord(input.reference, this.environment.identity) : undefined);
    if (refusal) return refused(refusal);
    const history = historyReference(this.context, input.reference);
    return history.length === 0 ? refused(missingRecord(input.reference, this.environment.identity)) : ok(history);
  }

  /** Return every scoped landed mutation strictly after from and through to. */
  async changes(input: ChangesInput): Promise<StoreResult<HistoryEntry[]>> {
    const namespace = namespaceAdmission(this.state);
    if (namespace) return refused(namespace);
    const missingIdentity = input.references?.find((reference) => reference.owner.type === "person" && this.environment.identity === undefined);
    return missingIdentity ? refused(missingRecord(missingIdentity, this.environment.identity)) : ok(changesReference(this.context, input));
  }

  /** Resolve names, origins, logical claims and repository-qualified code links. */
  async lookup(input: LookupInput): Promise<StoreResult<LookupResult>> { return lookupReference(this.context, input); }

  /** Publish eligible families against the injected in-memory remote. */
  async sync(): Promise<StoreResult<SyncResult>> { return syncReference(this.context, this.context.publication); }
}
