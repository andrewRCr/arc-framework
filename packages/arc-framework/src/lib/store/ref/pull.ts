/** State acquisition through independently reported remote fetches. */

import type { RemoteFailureReason } from "../../kernel/index.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { isGitProcessError } from "../../git/process-error.js";
import { FAMILY_IDS, type FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import type { PullInput, PullResult, PullOutcome, PullNotice } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { writeRefRepository } from "./repository.js";
import { refSyncTransportRemedy } from "./sync-remedy.js";
import { withRefSyncDeadline } from "./sync-deadline.js";
import { fetchRefRemote } from "./fetch.js";
import { readSyncRefs } from "./sync-graph.js";
import type { RefMergeOptions } from "./sync-merge.js";
import { mergePulledRefState, captureFetchedHistories } from "./sync-pull-lifecycle.js";
import { isManifestRef } from "./manifest.js";
import { HistoryRefSchema } from "../refusal.js";

/** Fetch only explicitly designated state sources into this store's tracking namespace. */
export async function pullRefStore(context: RefBackendContext, input: PullInput = {},
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"]): Promise<StoreResult<PullResult>> {
  try { return await withRefSyncDeadline(context, (scoped) => pullRefStoreOnce(scoped, input, onMerged, onApplied)); }
  catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`,
      remedy: { text: "Wait for the holder to finish or release its lock, then retry the pull; earlier ref merges remain applied." } } };
  }
}

async function pullRefStoreOnce(context: RefBackendContext, input: PullInput,
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"]): Promise<StoreResult<PullResult>> {
  const designation = await readRefDesignation(context);
  const stop = refDesignationStop(designation);
  if (stop) return { status: "ok", result: { states: [stop], pulls: [] } };
  context = await writeRefRepository(context);
  const identity = await context.identity();
  const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution"
    && (identity !== null || FAMILY_REGISTRY[family].scope !== "identity"));
  const pulls: PullOutcome[] = [];
  for (const remote of designation.remotes.filter(({ role }) => role === "push" || role === "read")) {
    const outcome = await pullRemote(context, input, designation, remote, families, onMerged, onApplied);
    if (outcome === "restart") return pullRefStore(context.repository?.source ?? context, input, onMerged, onApplied);
    pulls.push(outcome);
    if (timedOutPull(outcome)) break;
  }
  return { status: "ok", result: { states: [], pulls } };
}

async function pullRemote(context: RefBackendContext, input: PullInput, designation: RefDesignation,
  remote: RefRemoteDesignation, families: FamilyId[],
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"]): Promise<PullOutcome | "restart"> {
  const notices: PullNotice[] = [];
  const common = { remote: remote.name, role: remote.role === "read" ? "read" as const : "state" as const,
    families: remote.role === "read" ? families.filter((family) => FAMILY_REGISTRY[family].scope !== "identity") : families, notices };
  try {
    const fetched = await fetchRefRemote(context, remote, designation, input.history, context.syncDeadline?.signal);
    if (fetched.status === "unreachable") return failedRemotePull(context, common, fetched.cause, fetched.stderr || "The state fetch failed.");
    const prefix = `refs/arc-remotes/${remote.name}/`;
    const incoming = new Map([...(await readSyncRefs(context, prefix))].map(([ref, tip]) =>
      [`refs/arc/${ref.slice(prefix.length)}`, tip] as const).filter(([ref]) => isManifestRef(ref) || HistoryRefSchema.safeParse(ref).success));
    captureFetchedHistories(incoming, input.history ?? [], remote.name, fetched);
    const merged = remote.role === "push" ? await mergePulledRefState(context, incoming, designation, remote, input.history ?? [], {
      lock: context.lock, onApplied: async (physical, ref, before, after, applied) => {
        notices.push(...applied); await onApplied?.(physical, ref, before, after, applied);
      },
    }) : null;
    if (merged?.status === "restart") return "restart";
    if (merged?.status === "fetch-failed") return failedRemotePull(context, common, merged.fetched.cause, merged.fetched.stderr || "The history fetch failed.");
    if (merged) onMerged?.(remote.name, incoming);
    return { ...common, notices: merged?.notices ?? notices, status: fetched.refs.some(({ flag }) => flag !== "=") || merged?.changed ? "pulled" : "noop" };
  } catch (error) {
    if (!context.syncDeadline?.signal.aborted || !isGitProcessError(error) || error.kind !== "canceled") throw error;
    return failedRemotePull(context, common, "timeout", "The pull deadline expired while applying fetched state; earlier merges remain applied.");
  }
}

type PullScope = Pick<PullOutcome, "remote" | "role" | "families" | "notices">;

function failedRemotePull(context: RefBackendContext, common: PullScope, cause: RemoteFailureReason, condition: string): PullOutcome {
  return { ...common, status: "failed", failure: { code: "unreachable", class: "recoverable", cause, condition,
    remedy: refSyncTransportRemedy(context, "pull"),
  } };
}

function timedOutPull(outcome: PullOutcome): boolean {
  return outcome.status === "failed" && outcome.failure.code === "unreachable" && outcome.failure.cause === "timeout";
}
