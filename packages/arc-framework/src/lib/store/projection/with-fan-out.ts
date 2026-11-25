/** Observe landed public store writes and sync attempts without changing their outcomes. */
import type { Store } from "../contract.js";
import type { RecordReference } from "../identity.js";
import type { StoreResult } from "../refusal.js";

/** An invocation-owned notification sink, which may refuse stale command authority before scheduling. */
export type FanOutRequest = (references: readonly RecordReference[]) => Promise<void>;

/** Capture command authority before awaiting the backend; scheduling and diagnostics remain command-owned. */
export interface FanOutDependencies {
  readonly capture: () => FanOutRequest | null;
  readonly report: (cause: unknown) => void;
}
const decorated = new WeakSet<Store>();

/** Decorate a writable store once, leaving an in-repo store inert. */
export function withFanOut(store: Store, deps: FanOutDependencies): Store {
  if (!store.capabilities.stateOffBranch || decorated.has(store)) return store;
  const write: Store["write"] = async input => {
    const request = captureRequest(deps);
    const result = await store.write(input);
    if (result.status === "ok") await notify(deps, request, [result.result.reference]);
    return result;
  };
  const batch: Store["batch"] = async input => {
    const request = captureRequest(deps);
    const result = await store.batch(input);
    if (result.status === "ok") await notify(deps, request, result.result.writes.map(write => write.reference));
    return result;
  };
  const wrapped: Store = { capabilities: store.capabilities, write, batch,
    pull: input => syncAndNotify(deps, () => store.pull(input)),
    push: input => syncAndNotify(deps, () => store.push(input)),
    read: input => store.read(input), list: input => store.list(input), version: () => store.version(),
    history: input => store.history(input), changes: input => store.changes(input), lookup: input => store.lookup(input),
    maintain: () => store.maintain() };
  decorated.add(wrapped);
  return wrapped;
}

async function syncAndNotify<T>(deps: FanOutDependencies, sync: () => Promise<StoreResult<T>>): Promise<StoreResult<T>> {
  const request = captureRequest(deps);
  let result: StoreResult<T> | undefined;
  try {
    result = await sync();
    return result;
  } finally {
    // The tree guard stops before sync can merge anything. Other failures can follow a merge.
    if (result?.status !== "refused" || result.refusal.code !== "tracked-state") await notify(deps, request, []);
  }
}

function captureRequest(deps: FanOutDependencies): FanOutRequest | null {
  try { return deps.capture(); }
  catch (cause) { report(deps, cause); return null; }
}

async function notify(deps: FanOutDependencies, request: FanOutRequest | null, references: readonly RecordReference[]): Promise<void> {
  if (request === null) return;
  try { await request(references); }
  catch (cause) { report(deps, cause); }
}

function report(deps: FanOutDependencies, cause: unknown): void {
  try { deps.report(cause); } catch { return; }
}
