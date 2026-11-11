/** Observe landed public store writes and sync attempts without changing their outcomes. */
import type { Store } from "../contract.js";
import type { RecordReference } from "../identity.js";

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
  const pull: Store["pull"] = async input => {
    const request = captureRequest(deps);
    try { return await store.pull(input); }
    finally { await notify(deps, request, []); }
  };
  const push: Store["push"] = async input => {
    const request = captureRequest(deps);
    try { return await store.push(input); }
    finally { await notify(deps, request, []); }
  };
  const wrapped: Store = { capabilities: store.capabilities, write, batch, pull, push,
    read: input => store.read(input), list: input => store.list(input), version: () => store.version(),
    history: input => store.history(input), changes: input => store.changes(input), lookup: input => store.lookup(input),
    maintain: () => store.maintain() };
  decorated.add(wrapped);
  return wrapped;
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
