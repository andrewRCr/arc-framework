/** Seed a temporary repository's ref store in process, as the starting state a test that spawns the CLI reads. */
import { createRefStore } from "../../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import type { RecordReference } from "../../../src/lib/store/identity.js";
import { findTrackedStateRefusal } from "../../../src/lib/store/selection.js";
import type { Slug } from "../../../src/lib/kernel/index.js";
import type { BatchInput, WriteResult } from "../../../src/lib/store/write.js";

/** One record to create: its reference, content, and, for a primary record, its placement and links. */
export type SeedRecord = Omit<Extract<BatchInput["writes"][number], { action: "put" }>, "action" | "expected">;

/** A seeded record's reference, its owner's minted UID included, and the version it landed at. */
export interface SeededRecord { readonly reference: RecordReference; readonly version: NonNullable<WriteResult["version"]> }

const provenance = { verb: "fixture", lifecycleAction: "seed" } as const;
const refused = (refusal: { code: string; condition: string }): Error =>
  new Error(`The store refused the seed: ${refusal.code}: ${refusal.condition}`);

/**
 * Create records in a repository's ref store, in one batch through the ref backend's ports, where the store a command
 * composes there reads them: under the repository's common Git directory, written as the given identity. A repository
 * whose `HEAD` tracks ARC state is refused before any write, as that composed store refuses every operation there.
 * @param root - The temporary repository's checkout.
 * @param identity - The ARC identity the writes run as.
 * @param records - The records to create, none of them present yet.
 * @returns Each record's reference and version, in the order given.
 */
export async function seedStore(root: string, identity: Slug, records: readonly SeedRecord[]): Promise<SeededRecord[]> {
  const ports = createDefaultRefStorePorts({ checkoutRoot: root, backingRepository: async () => null });
  const tracked = await findTrackedStateRefusal(ports.exec);
  if (tracked !== null) throw refused(tracked);
  const store = createRefStore({ ...ports, identity: async () => identity });
  const result = await store.batch({ provenance, writes: records.map((record) => ({ ...record, action: "put", expected: null })) });
  if (result.status !== "ok") throw refused(result.refusal);
  return result.result.writes.map(({ reference, version }) => {
    if (version === undefined) throw new Error("A seeded record landed with no version.");
    return { reference, version };
  });
}
