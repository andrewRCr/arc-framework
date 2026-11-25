/** Produce view conflict evidence through two accepted writes and the real memory sync protocol. */
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess, type createLifecycleHarness } from "./lifecycle-harness.js";
import { createMemoryRemote } from "./sync.js";
import { ReferenceBackend } from "./reference-backend.js";

/** Merge two edits of one exact record and return its visible current content and open conflicts. */
export async function conflictViewRecord(h: ReturnType<typeof createLifecycleHarness>, record: StoreRecord,
  localContent: string, incomingContent: string): Promise<StoreRecord> {
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference: record.reference }));
  const incoming = lifecycleSuccess(await writer.read({ reference: record.reference }));
  const provenance = { verb: "update", lifecycleAction: "update" };
  lifecycleSuccess(await h.store.write({ ...recordPut(local, { content: localContent }), provenance }));
  lifecycleSuccess(await writer.write({ ...recordPut(incoming, { content: incomingContent }), provenance }));
  lifecycleSuccess(await h.store.pull());
  return lifecycleSuccess(await h.store.read({ reference: record.reference }));
}
