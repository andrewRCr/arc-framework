/** Authentic independently retired generations used to exercise ambiguous former names. */
import type { ReferenceBackend } from "./reference-backend.js";
import { createDecomposeHarness } from "./decompose-harness.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { createMemoryRemote } from "./sync.js";

/** Reconcile another clone's retired generation without acquiring a locally held name. */
export async function importRetiredAlias(store: ReferenceBackend, former: string, current: string): Promise<void> {
  const independent = createDecomposeHarness();
  const primary = await independent.seedRenamedWorkUnit(former, current);
  await independent.seedRetiredWorkUnit(primary);
  const remote = createMemoryRemote();
  store.context.publication.remote = remote;
  lifecycleSuccess(await store.push());
  independent.store.context.publication.remote = remote;
  lifecycleSuccess(await independent.store.push());
  lifecycleSuccess(await store.push());
}
