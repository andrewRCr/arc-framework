/** Seed a temporary repository's ref store in process, as the starting state a test that spawns the CLI reads. */
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { findTrackedStateRefusal } from "../../../src/lib/store/selection.js";
import type { Slug } from "../../../src/lib/kernel/index.js";
import type { BatchInput, WriteResult } from "../../../src/lib/store/write.js";

type Put = Extract<BatchInput["writes"][number], { action: "put" }>;

/** One record to write: its reference, content, and, for a primary record, its placement and links. A record already
 * present, such as one `arc init` wrote, is replaced at the version the test read; any other is created. */
export type SeedRecord = Omit<Put, "action" | "expected"> & { readonly expected?: Put["expected"] };

/** A seeded record's reference, its owner's minted UID included, and the version it landed at. */
export interface SeededRecord { readonly reference: RecordReference; readonly version: NonNullable<WriteResult["version"]> }

const provenance = { verb: "fixture", lifecycleAction: "seed" } as const;
const refused = (refusal: { code: string; condition: string }, action = "seed"): Error =>
  new Error(`The store refused the ${action}: ${refusal.code}: ${refusal.condition}`);

/**
 * Write records in a repository's ref store, in one batch through the ref backend's ports, where the store a command
 * composes there reads them: under the repository's common Git directory, written as the given identity. A repository
 * whose `HEAD` tracks ARC state is refused before any write, as that composed store refuses every operation there.
 * @param root - The temporary repository's checkout.
 * @param identity - The ARC identity the writes run as.
 * @param records - The records to write, each absent unless it names the version it replaces.
 * @returns Each record's reference and version, in the order given.
 */
export async function seedStore(root: string, identity: Slug, records: readonly SeedRecord[]): Promise<SeededRecord[]> {
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const tracked = await findTrackedStateRefusal(ports.exec);
  if (tracked !== null) throw refused(tracked);
  const store = createRefStore({ ...ports, identity: async () => identity });
  const result = await store.batch({ provenance, writes: records.map((record) => ({ ...record, action: "put", expected: record.expected ?? null })) });
  if (result.status !== "ok") throw refused(result.refusal);
  return result.result.writes.map(({ reference, version }) => {
    if (version === undefined) throw new Error("A seeded record landed with no version.");
    return { reference, version };
  });
}

/**
 * Read one record a repository's ref store holds, as the store a command composes there reads it, so a test can check
 * what a spawned verb wrote or replace the record at the version it read.
 * @param root - The temporary repository's checkout.
 * @param identity - The ARC identity the read runs as.
 * @param reference - The record to read.
 * @returns The record, refusing when the store holds none.
 */
export async function readStoreRecord(root: string, identity: Slug, reference: RecordReference): Promise<StoreRecord> {
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const read = await createRefStore({ ...ports, identity: async () => identity }).read({ reference });
  if (read.status === "refused") throw refused(read.refusal, "read");
  return read.result;
}

/**
 * Remove one record from a repository's ref store at the version it holds, as a store verb retires one, so a test can
 * reach a state that record's absence decides.
 * @param root - The temporary repository's checkout.
 * @param identity - The ARC identity the write runs as.
 * @param reference - The record to remove.
 */
export async function removeStoreRecord(root: string, identity: Slug, reference: RecordReference): Promise<void> {
  const held = await readStoreRecord(root, identity, reference);
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const result = await createRefStore({ ...ports, identity: async () => identity }).batch({ provenance,
    writes: [{ action: "remove", reference: held.reference, expected: held.version }] });
  if (result.status !== "ok") throw refused(result.refusal, "removal");
}
