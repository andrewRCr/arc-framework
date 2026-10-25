/** Invocation-bound checkout, in-flight quality and pull evidence for store lifecycle status. */
import { ownerHolderRequest, type LocusPorts } from "../../lib/work-unit/locus-ports.js";
import type { StoreRecord } from "../../lib/store/read.js";
import type { Store } from "../../lib/store/contract.js";
import type { GitExec } from "../../lib/git/exec.js";
import { resolveIdentity } from "../../lib/git/identity.js";
import { deriveStoreInFlight } from "../../lib/git/in-flight-store.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import { createLocusPorts } from "../../lib/locus/lifecycle-ports.js";
import { createStoreSyncPort, type StoreSyncPort } from "../../lib/store/operational-sync.js";
import { describeStorePull } from "../../lib/session-init/store-user-pull.js";
import type { ProjectReadinessWarning } from "../../lib/status/project-view.js";
import type { readStatusCheckoutRoster } from "./checkout-roster.js";
/** Local and synchronization evidence can be supplied by one already-bound invocation. */
export interface StoreLifecycleStatusPorts {
  findHoldingCheckout?: LocusPorts["findHoldingCheckout"];
  readInFlightWarnings?: () => Promise<string[]>;
  readRoster?: (identity: string) => ReturnType<typeof readStatusCheckoutRoster>;
}
/** Refresh Store state before acquiring the lifecycle and checkout facts to render. */
export async function pullStoreStatus(ports: { sync?: StoreSyncPort } = {}): Promise<ProjectReadinessWarning[]> {
  const pull = await (ports.sync ?? createStoreSyncPort()).pull();
  if (pull.status === "pulled" || pull.status === "noop" || pull.status === "no-remote") return [];
  const orientation = describeStorePull(pull);
  const parts = [orientation.summary];
  if ("remedy" in pull && !orientation.summary.includes(pull.remedy.text)) parts.push(pull.remedy.text);
  if (pull.status === "designation-needed") parts.push(pull.remedy.argv.join(" "));
  return [{ code: "pull-incomplete", rendered: parts.join(" ") }];
}
/** Keep a failed holder observation visible in the path field rather than fabricating absence. */
export async function readStoreStatusLocus(input: { cwd: string; exec: GitExec; store: Store; slug: string; record: StoreRecord | undefined },
  ports: StoreLifecycleStatusPorts = {}): Promise<{ worktreePath?: string; warnings: string[] }> {
  const locus = createLocusPorts(input);
  const find = ports.findHoldingCheckout ?? locus.findHoldingCheckout;
  let worktreePath: string | null;
  const warnings: string[] = [];
  try {
    const holder = input.record === undefined ? { kind: "none" as const } : await find(ownerHolderRequest(input.record));
    worktreePath = holder.kind === "none" ? null : holder.path;
    if (holder.kind === "unbound") warnings.push(holder.reason);
  }
  catch (error) { worktreePath = error instanceof Error ? error.message : String(error); }
  const quality = ports.readInFlightWarnings === undefined ? await defaultWarnings(input, find) : await ports.readInFlightWarnings();
  return { ...(worktreePath === null ? {} : { worktreePath }), warnings: [...new Set([...warnings, ...quality])] };
}
async function defaultWarnings(input: { store: Store; cwd: string; exec: GitExec }, findHoldingCheckout: LocusPorts["findHoldingCheckout"]): Promise<string[]> {
  const identity = await resolveIdentity({ exec: input.exec });
  const result = await deriveStoreInFlight({ ...input, identity, teamMode: false, findHoldingCheckout });
  return result.warnings.map(renderInFlightWarning);
}
