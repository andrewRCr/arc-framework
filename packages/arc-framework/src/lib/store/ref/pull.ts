/** State acquisition through independently reported remote fetches. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RemoteFailureReason } from "../../kernel/index.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { isGitProcessError } from "../../git/process-error.js";
import { FAMILY_IDS, type FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import type { PullInput, PullResult, PullOutcome, PullNotice, SyncState } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { resolveRefDesignation, type RefDesignationResolution } from "./designation-first.js";
import { storeDirectoryVanished, writeRefRepository } from "./repository.js";
import { refSyncTransportRemedy } from "./sync-remedy.js";
import { withRefSyncDeadline } from "./sync-deadline.js";
import { adoptSourceProjectIdentity } from "./adopt-source-project.js";
import { fetchRefRemote } from "./fetch.js";
import { releaseEndedRefKeepers } from "./fetch-seen-ended.js";
import { RefFetchKeeperLockError } from "./fetch-keeper-lock.js";
import { RefFetchIncompleteError } from "./fetch-completeness.js";
import { readSyncRefs } from "./sync-graph.js";
import type { RefMergeOptions } from "./sync-merge.js";
import { mergePulledRefState, captureFetchedHistories, isWithheld } from "./sync-pull-lifecycle.js";
import { isStateRef } from "./manifest.js";
import { FORWARDING_REF, readForwardingRecord, forwardingFollowRemedy, readSourceForwardingRemedy } from "./forwarding-record.js";

/** Fetch only explicitly designated state sources into this store's tracking namespace. */
export async function pullRefStore(context: RefBackendContext, input: PullInput = {},
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"], resolution?: RefDesignationResolution): Promise<StoreResult<PullResult>> {
  try { return await withRefSyncDeadline(context, (scoped) => pullRefStoreOnce(scoped, input, onMerged, onApplied, new Map(), resolution)); }
  catch (error) {
    if (error instanceof RefFetchKeeperLockError) return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lock,
      condition: error.message, remedy: { text: `Wait for the Git writer holding ${error.lock} to finish. If the lock is stale, remove it after confirming no writer is active, then retry.` } } };
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the pull; earlier ref merges remain applied." } } };
  }
}

async function pullRefStoreOnce(context: RefBackendContext, input: PullInput,
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"],
  retained = new Map<string, PullAttemptObservations>(), resolution?: RefDesignationResolution): Promise<StoreResult<PullResult>> {
  const resolved = resolution ?? await resolveRefDesignation(context);
  const { designation } = resolved;
  const states = [...resolved.states];
  const sources = designation.remotes.filter(({ role }) => role === "read" || role === "push" && states.every(({ status }) => status === "move-unfinished") && !resolved.pulls.length);
  if (!sources.length) return { status: "ok", result: { states, pulls: resolved.pulls } };
  context = await writeRefRepository(context);
  const identity = await context.identity();
  const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution"
    && (identity !== null || FAMILY_REGISTRY[family].scope !== "identity"));
  const pulls: PullOutcome[] = [...resolved.pulls];
  for (const remote of sources) {
    const observed = retained.get(remote.name) ?? { notices: [], changed: false };
    retained.set(remote.name, observed);
    const outcome = await pullRemote(context, input, designation, remote, families, onMerged, onApplied, observed);
    if (outcome === "restart") return pullRefStoreOnce({ ...(context.repository?.source ?? context), syncDeadline: context.syncDeadline },
      input, onMerged, onApplied, retained);
    if ("state" in outcome) {
      states.push(outcome.state);
      if (outcome.partial) pulls.push(outcome.partial);
      continue;
    }
    pulls.push(outcome);
    if (timedOutPull(outcome)) break;
  }
  return { status: "ok", result: { states, pulls } };
}

async function pullRemote(context: RefBackendContext, input: PullInput, designation: RefDesignation,
  remote: RefRemoteDesignation, families: FamilyId[],
  onMerged: ((remote: string, incoming: ReadonlyMap<string, string>) => void) | undefined,
  onApplied: RefMergeOptions["onApplied"], observed: PullAttemptObservations): Promise<PullOutcome | ForwardedPull | "restart"> {
  const notices = observed.notices;
  const common = remotePullScope(remote, families, notices);
  let followDue = false;
  try {
    const prefix = `refs/arc-remotes/${remote.name}/`;
    const previous = new Map([...(await readSyncRefs(context, prefix))].map(([ref, tip]) => [`refs/arc/${ref.slice(prefix.length)}`, tip]));
    followDue = previous.has(FORWARDING_REF);
    const fetched = await fetchRefRemote(context, remote, designation, input.history, context.syncDeadline?.signal);
    notices.push(...fetched.notices);
    if (fetched.status === "unreachable") return failedRemotePull(context, common, fetched.cause, fetched.stderr || "The state fetch failed.", followDue);
    const fetchedTips = await readSyncRefs(context, prefix);
    const forwarded = await readRemoteForwarding(context, common,
      fetchedTips.get(`${prefix}${FORWARDING_REF.slice("refs/arc/".length)}`));
    if (forwarded) return forwarded;
    observed.changed ||= fetched.refs.some(({ flag }) => flag !== "=");
    const adopted = await adoptSourceProjectIdentity(context, remote, designation);
    if (adopted.status === "refused") return { ...common, status: "failed", failure: { code: "refused", class: "terminal",
      message: "The read source was fetched, but its project identity could not be adopted.",
      condition: adopted.refusal.condition, remedy: adopted.refusal.remedy } };
    observed.changed ||= adopted.result;
    const { incoming, refused } = fetchedSource(prefix, fetchedTips, fetched.notices);
    captureFetchedHistories(incoming, input.history ?? [], remote.name, fetched);
    const withheld = withholdRefs(incoming, refused, previous);
    const merged = remote.role === "push" ? await mergePulledRefState(context, incoming, designation, remote, input.history ?? [], {
      withheld, lock: context.lock, onObserved: (reported) => { notices.push(...reported); },
      onApplied: async (physical, ref, before, after, applied) => {
        observed.changed = true;
        notices.push(...applied); await onApplied?.(physical, ref, before, after, applied);
      },
    }, previous) : null;
    if (merged?.status === "restart") return "restart";
    if (merged?.status === "fetch-failed") return failedRemotePull(context, common, merged.fetched.cause, merged.fetched.stderr || "The history fetch failed.", followDue);
    if (merged) {
      const applied = new Map([...incoming].filter(([ref]) => !isWithheld(ref, incoming, withheld)));
      await releaseEndedRefKeepers(context, remote.name, applied);
      onMerged?.(remote.name, applied);
    }
    return { ...common, notices: uniqueNotices([...notices, ...merged?.notices ?? []]),
      status: observed.changed || merged?.changed ? "pulled" : "noop" };
  } catch (error) {
    if (error instanceof RefFetchIncompleteError) return { ...common, notices: uniqueNotices([...notices, ...error.notices]), status: "failed", failure: error.failure };
    if (await storeDirectoryVanished(context, error)) return "restart";
    if (!context.syncDeadline?.signal.aborted || !isGitProcessError(error) || error.kind !== "canceled") throw error;
    return failedRemotePull(context, common, "timeout", "The pull deadline expired while applying fetched state; earlier merges remain applied.", followDue);
  }
}

/** The fetched state refs a merge reads, less each one whose fetch drew a notice. */
function fetchedSource(prefix: string, tips: ReadonlyMap<string, string>, notices: readonly PullNotice[]): { incoming: Map<string, string>; refused: Set<string> } {
  const refused = new Set(notices.flatMap((notice) => "ref" in notice ? [notice.ref] : []));
  const incoming = new Map([...tips].map(([ref, tip]): [string, string] => [`refs/arc/${ref.slice(prefix.length)}`, tip])
    .filter(([ref]) => isStateRef(ref) && !refused.has(ref)));
  return { incoming, refused };
}

/** A ref whose fetch drew a notice still stands, for end detection, where it stood before the fetch; merges leave it. */
function withholdRefs(incoming: Map<string, string>, refused: ReadonlySet<string>, previous: ReadonlyMap<string, string>): Map<string, string> {
  const withheld = new Map([...refused].flatMap((ref) => {
    const tip = previous.get(ref);
    return tip && isStateRef(ref) && !incoming.has(ref) ? [[ref, tip] as const] : [];
  }));
  for (const [ref, tip] of withheld) incoming.set(ref, tip);
  return withheld;
}

type PullScope = Pick<Extract<PullOutcome, { status: "pulled" | "noop" }>, "remote" | "role" | "families" | "notices">;

function remotePullScope(remote: RefRemoteDesignation, families: FamilyId[], notices: PullNotice[]): PullScope {
  return { remote: remote.name, role: remote.role === "read" ? "read" : "state",
    families: remote.role === "read" ? families.filter(family => FAMILY_REGISTRY[family].scope !== "identity") : families, notices };
}

async function readRemoteForwarding(context: RefBackendContext, common: PullScope, tip: string | undefined): Promise<PullOutcome | ForwardedPull | null> {
  const forwarding = await readForwardingRecord(context, tip, common.remote);
  if (forwarding.status === "refused") return { ...common, status: "failed", failure: { code: "refused", class: "terminal",
    message: forwarding.refusal.condition, condition: forwarding.refusal.condition, remedy: forwarding.refusal.remedy } };
  if (!forwarding.result) return null;
  const remedy = forwardingFollowRemedy(common.remote);
  if (common.role === "read") {
    const condition = `Read source ${common.remote} carries ${FORWARDING_REF}; its state moved.`;
    return { ...common, status: "failed", failure: { code: "refused", class: "terminal", message: condition, condition,
      remedy: readSourceForwardingRemedy(common.remote) } };
  }
  return { state: { status: "moved", remote: common.remote, remedy },
    ...(common.notices.length ? { partial: { ...common, status: "noop" as const } } : {}) };
}

function failedRemotePull(context: RefBackendContext, common: PullScope, cause: RemoteFailureReason, condition: string, followDue = false): PullOutcome {
  const remedy = refSyncTransportRemedy(context, "pull");
  return { ...common, notices: uniqueNotices(common.notices), status: "failed", failure: { code: "unreachable", class: "recoverable", cause, condition,
    remedy: followDue ? { text: `${remedy.text} A forwarding record remains recorded for ${common.remote}; bring in the tracked pointer's change and run arc store migrate.`,
      argv: ["arc", "store", "migrate"] } : remedy,
  } };
}

function timedOutPull(outcome: PullOutcome): boolean {
  return outcome.status === "failed" && outcome.failure.code === "unreachable" && outcome.failure.cause === "timeout";
}

interface PullAttemptObservations { notices: PullNotice[]; changed: boolean }

interface ForwardedPull { state: Extract<SyncState, { status: "moved" }>; partial?: PullOutcome }

function uniqueNotices(notices: readonly PullNotice[]): PullNotice[] {
  const refused = new Set(notices.flatMap((notice) => notice.kind === "history-diverged" || notice.kind === "tracking-update-failed" ? [notice.ref] : []));
  return [...new Map(notices.filter((notice) => notice.kind !== "end-pending" || !refused.has(notice.ref))
    .map((notice) => [canonicalize(notice), notice])).values()];
}
