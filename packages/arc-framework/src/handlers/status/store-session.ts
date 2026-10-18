/** Store-backed session slots sharing invocation-scoped identity and checkout evidence. */
import type { Store } from "../../lib/store/contract.js";
import type { StoreSyncPort } from "../../lib/store/operational-sync.js";
import type { GitExec } from "../../lib/git/exec.js";
import type { DerivedLocusFrame } from "../../lib/locus/derived-reader.js";
import { createProjectIdentityReader } from "../../lib/store/project-identity.js";
import { createLocusPorts } from "../../lib/locus/lifecycle-ports.js";
import { findMarkerlessWorkUnitCheckouts } from "../../lib/locus/markerless-work-units.js";
import { deriveStoreInFlight, storeInFlightLocationUnavailable } from "../../lib/git/in-flight-store.js";
import { renderInFlightWarning } from "../../lib/git/in-flight-derivation.js";
import { runErrandState, type RunErrandStateOptions } from "../../lib/session-init/errand-state.js";
import { acquireStoreErrands } from "../../lib/errand/store-discovery.js";
import { findMaterializableWorkUnits, type MaterializableWorkUnitDiscoveryResult } from "../../lib/session-init/materializable-work-units.js";
import { createStoreUserReferencePrepareContext } from "../../lib/user-reference-reconcile-store.js";
import { projectUserReferenceSessionResult } from "../../lib/user-reference-reconcile.js";
import { planScratchReconcile } from "../../lib/user-reference-scratch.js";
import { runInboxState } from "../../lib/session-init/inbox-state.js";
import { listInbox } from "../../lib/inbox/listing.js";
import { listErrandQueue } from "../../lib/inbox/queue.js";
import { runPausedWork } from "../../lib/session-init/paused-work.js";
import { runInboundBackPressure } from "../../lib/session-init/inbound-back-pressure.js";
import { probeStoreUserPull } from "../../lib/session-init/store-user-pull.js";

/** One selected store and cached frame supply the operational session slots. */
export interface StoreSessionContext {
  store: Store; sync?: StoreSyncPort; cwd: string; exec: GitExec; identity: string | null;
  readFrame: () => Promise<DerivedLocusFrame | null>;
  readSettings: () => Promise<Record<string, string>>;
  readUserInbox: (identity: string) => Promise<string>;
  projectId?: () => Promise<string>;
  findHoldingCheckout?: (name: string) => Promise<string | null>;
}
/** Bind operational session slots without consulting code-remote reachability. */
export function createStoreSessionProbes(context: StoreSessionContext) {
  const projectId = context.projectId ?? createProjectIdentityReader(context.store);
  const ports = createLocusPorts(context);
  const findHoldingCheckout = context.findHoldingCheckout ?? (name => ports.findHoldingCheckout({ name, resolveLegacy: () => Promise.resolve(null) }));
  let oracle: ReturnType<typeof deriveStoreInFlight> | undefined;
  let errands: ReturnType<typeof acquireStoreErrands> | undefined;
  let markerless: ReturnType<typeof findMarkerlessWorkUnitCheckouts> | undefined;
  const getOracle = () => oracle ??= (async () => deriveStoreInFlight({ ...context, projectId,
    teamMode: (await context.readSettings())["team.mode"] === "true",
    roster: (await context.readFrame())?.roster, findHoldingCheckout }))();
  const getMarkerless = () => markerless ??= (async () => context.identity === null ? [] : findMarkerlessWorkUnitCheckouts({
    store: context.store, identity: context.identity, projectId, roster: (await context.readFrame())?.roster ?? [],
  }))();
  return {
    getOracle,
    userReferenceReconcile: async (workUnit: string) => {
      if (context.identity === null) throw new Error("User-reference reconciliation requires an identity.");
      const prepared = await createStoreUserReferencePrepareContext({ store: context.store, identity: context.identity, workUnit });
      if (prepared.status === "refused") return projectUserReferenceSessionResult({ status: "unavailable", ref: "store",
        reason: "state-unavailable", condition: prepared.refusal.condition, remedy: prepared.refusal.remedy, remoteEvidence: "not-applicable" },
        { userInbox: { path: "", content: "" } });
      return projectUserReferenceSessionResult(prepared.result.authority, { ...prepared.result.surfaces,
        scratch: await planScratchReconcile({ cwd: context.cwd, identity: context.identity, store: context.store }) });
    },
    errandState: async (input: Omit<RunErrandStateOptions, "entries" | "records" | "recordsComplete">) => {
      const snapshot = input.includeDiscovery ? await getOracle() : null;
      return runErrandState({ ...input, store: context.store, identity: context.identity,
        errandAcquisition: await (errands ??= acquireStoreErrands(context.store)),
        records: [], recordsComplete: false, entries: snapshot?.entries ?? null,
        residue: snapshot?.residue,
        oracleWarnings: snapshot?.warnings.map(renderInFlightWarning),
        localRefsAvailable: localRefsAvailable(snapshot),
        locallyPresentBranches: new Set(snapshot?.entries.flatMap(entry => !entry.remoteOnly && entry.branch !== undefined
          && (entry.worktreePath !== undefined || !storeInFlightLocationUnavailable(entry)) ? [entry.branch] : [])),
      });
    },
    getErrands: () => errands ??= acquireStoreErrands(context.store),
    materializableWorkUnits: async (): Promise<MaterializableWorkUnitDiscoveryResult> => {
      const oracle = await getOracle();
      const offer = await findMaterializableWorkUnits({ store: context.store, entries: oracle.entries,
        identity: context.identity, findHoldingCheckout, markerlessCheckouts: await getMarkerless(),
        localRefsAvailable: localRefsAvailable(oracle), projectId });
      return { ...offer, warnings: [...oracle.warnings.map(renderInFlightWarning), ...(offer.warnings ?? [])],
        remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null };
    },
    inboxState: (identity: string) => readStoreInboxSlot(context, identity),
    pausedWork: async () => {
      if (context.identity === null) return { items: [] };
      const oracle = await getOracle();
      return runPausedWork({ store: context.store, identity: context.identity,
        reviewAfterDays: positive((await context.readSettings())["pause.review_after_days"], 14), findHoldingCheckout,
        markerlessCheckouts: await getMarkerless(), inFlightEntries: oracle.entries,
        localRefsAvailable: localRefsAvailable(oracle), projectId });
    },
    inboundBackPressure: async () => {
      const active = (await context.readFrame())?.active;
      if (active == null) return null;
      const settings = await context.readSettings();
      return runInboundBackPressure({ store: context.store, workUnit: active.subject.key,
        countThreshold: positive(settings["inbound.retriage_after_entries"], 10),
        ageThresholdDays: positive(settings["inbound.retriage_after_days"], 30) });
    },
    user: async () => probeStoreUserPull({ store: context.store, sync: context.sync,
      remoteSyncEnabled: (await context.readSettings())["session.remote_sync"] === "enabled" }),
  };
}
async function readStoreInboxSlot(context: StoreSessionContext, identity: string) {
  const inboxContext = { store: context.store, identity, now: () => new Date() };
  const [queue, listing, content] = await Promise.all([listErrandQueue(inboxContext),
    listInbox({ list: "personal" }, inboxContext), context.readUserInbox(identity)]);
  if (queue.state === "refused") throw new Error(`${queue.reason} ${queue.remedy.text}`);
  if (listing.state === "refused") throw new Error(`${listing.reason} ${listing.remedy.text}`);
  const survivors = listing.entries.flatMap(row => row.survivor === undefined ? [] : [{ id: row.id, title: row.title, home: row.survivor.home }]);
  return runInboxState({ content, queuedEntryIds: new Set(queue.members.filter(member => member.inbox === "personal").map(member => member.id)), survivors });
}
function positive(value: string | undefined, fallback: number): number {
  const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
function localRefsAvailable(snapshot: Awaited<ReturnType<typeof deriveStoreInFlight>> | null): boolean {
  return snapshot !== null && !snapshot.warnings.some(warning => warning.code === "ref-enumeration-failed");
}
