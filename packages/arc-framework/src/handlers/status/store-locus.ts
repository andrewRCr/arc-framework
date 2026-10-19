/** Invocation-bound checkout, in-flight quality and pull evidence for store lifecycle status. */
import type { PullNotice } from "../../lib/store/sync.js";
import type { Store } from "../../lib/store/contract.js";
import type { GitExec } from "../../lib/git/exec.js";
import { resolveIdentity } from "../../lib/git/identity.js";
import { deriveStoreInFlight } from "../../lib/git/in-flight-store.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import { createLocusPorts } from "../../lib/locus/lifecycle-ports.js";
import { createStoreSyncPort, pullResultNotices, type StoreSyncPort } from "../../lib/store/operational-sync.js";
import { describeStorePull } from "../../lib/session-init/store-user-pull.js";
import type { ProjectReadinessWarning } from "../../lib/status/project-view.js";
import type { readStatusCheckoutRoster } from "./checkout-roster.js";
/** Local and synchronization evidence can be supplied by one already-bound invocation. */
export interface StoreLifecycleStatusPorts {
  findHoldingCheckout?: (slug: string) => Promise<string | null>;
  readInFlightWarnings?: () => Promise<string[]>;
  readRoster?: (identity: string) => ReturnType<typeof readStatusCheckoutRoster>;
}
/** Refresh Store state before acquiring the lifecycle and checkout facts to render. */
export async function pullStoreStatus(ports: { sync?: StoreSyncPort } = {}): Promise<ProjectReadinessWarning[]> {
  const pull = await (ports.sync ?? createStoreSyncPort()).pull();
  const warnings: ProjectReadinessWarning[] = [];
  if (pull.status !== "pulled" && pull.status !== "noop" && pull.status !== "no-remote") {
    const orientation = describeStorePull(pull);
    const parts = [orientation.summary];
    if ("remedy" in pull && pull.remedy && !orientation.summary.includes(pull.remedy.text)) parts.push(pull.remedy.text);
    if (pull.status === "designation-needed" && pull.remedy.argv) parts.push(pull.remedy.argv.join(" "));
    warnings.push({ code: "pull-incomplete", rendered: parts.join(" ") });
  }
  return [...warnings, ...pullResultNotices(pull).map(notice => ({ code: "pull-notice" as const, rendered: renderPullNotice(notice) }))];
}

function renderPullNotice(notice: PullNotice): string {
  const parts = [notice.condition];
  if (notice.kind === "ended-with-conflicts") parts.push(
    `Ended item ${notice.item.name} retains conflicts: ${notice.conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`,
    "The ordinary conflict view does not list these retained conflicts.");
  parts.push(notice.remedy.text);
  if (notice.remedy.argv && !notice.remedy.text.includes(notice.remedy.argv.join(" "))) parts.push(notice.remedy.argv.join(" "));
  return parts.join(" ");
}

/** Keep a failed holder observation visible in the path field rather than fabricating absence. */
export async function readStoreStatusLocus(input: { cwd: string; exec: GitExec; store: Store; slug: string },
  ports: StoreLifecycleStatusPorts = {}): Promise<{ worktreePath?: string; warnings: string[] }> {
  const locus = createLocusPorts(input);
  const find = ports.findHoldingCheckout ?? ((name: string) => locus.findHoldingCheckout({ name, resolveLegacy: () => Promise.resolve(null) }));
  let worktreePath: string | null;
  try { worktreePath = await find(input.slug); }
  catch (error) { worktreePath = error instanceof Error ? error.message : String(error); }
  const quality = ports.readInFlightWarnings === undefined ? await defaultWarnings(input, find) : await ports.readInFlightWarnings();
  return { ...(worktreePath === null ? {} : { worktreePath }), warnings: quality };
}
async function defaultWarnings(input: { store: Store; cwd: string; exec: GitExec }, findHoldingCheckout: (slug: string) => Promise<string | null>): Promise<string[]> {
  const identity = await resolveIdentity({ exec: input.exec });
  const result = await deriveStoreInFlight({ ...input, identity, teamMode: false, findHoldingCheckout });
  return result.warnings.map(renderInFlightWarning);
}
