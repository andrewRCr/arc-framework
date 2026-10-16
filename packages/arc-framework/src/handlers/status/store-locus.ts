/** Invocation-bound checkout, in-flight quality and pull evidence for store lifecycle status. */
import type { Store } from "../../lib/store/contract.js";
import type { GitExec } from "../../lib/git/exec.js";
import { resolveIdentity } from "../../lib/git/identity.js";
import { deriveStoreInFlight } from "../../lib/git/in-flight-store.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import { createLocusPorts } from "../../lib/locus/lifecycle-ports.js";
import { createStoreSyncPort, type StoreSyncPort } from "../../lib/store/operational-sync.js";
/** Local and synchronization evidence can be supplied by one already-bound invocation. */
export interface StoreLifecycleStatusPorts {
  findHoldingCheckout?: (slug: string) => Promise<string | null>;
  readInFlightWarnings?: () => Promise<string[]>;
  sync?: StoreSyncPort;
}
/** Keep a failed holder observation visible in the path field rather than fabricating absence. */
export async function readStoreStatusLocus(input: { cwd: string; exec: GitExec; store: Store; slug: string; fetch: boolean },
  ports: StoreLifecycleStatusPorts = {}): Promise<{ worktreePath?: string; warnings: string[] }> {
  const locus = createLocusPorts(input);
  const find = ports.findHoldingCheckout ?? ((name: string) => locus.findHoldingCheckout({ name, resolveLegacy: () => Promise.resolve(null) }));
  const warnings: string[] = [];
  if (input.fetch) {
    const pull = await (ports.sync ?? createStoreSyncPort()).pull();
    if (pull.status === "unreachable") warnings.push("Remote unreachable; query derived from local refs only.");
  }
  let worktreePath: string | null;
  try { worktreePath = await find(input.slug); }
  catch (error) { worktreePath = error instanceof Error ? error.message : String(error); }
  const quality = ports.readInFlightWarnings === undefined ? await defaultWarnings(input, find) : await ports.readInFlightWarnings();
  return { ...(worktreePath === null ? {} : { worktreePath }), warnings: [...quality, ...warnings] };
}
async function defaultWarnings(input: { store: Store; cwd: string; exec: GitExec }, findHoldingCheckout: (slug: string) => Promise<string | null>): Promise<string[]> {
  const identity = await resolveIdentity({ exec: input.exec });
  const result = await deriveStoreInFlight({ ...input, identity, teamMode: false, findHoldingCheckout });
  return result.warnings.map(renderInFlightWarning);
}
