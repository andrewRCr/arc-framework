/** State acquisition through independently reported remote fetches. */

import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { FAMILY_IDS, type FamilyId } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import type { PullInput, PullResult, PullOutcome } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { writeRefRepository } from "./repository.js";
import { fetchRefRemote } from "./fetch.js";
import { readSyncRefs } from "./sync-graph.js";
import { mergeRefSets, type RefMergeOptions } from "./sync-merge.js";
import { isManifestRef } from "./manifest.js";
import { HistoryRefSchema } from "../refusal.js";

/** Fetch only explicitly designated state sources into this store's tracking namespace. */
export async function pullRefStore(context: RefBackendContext, input: PullInput = {},
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"]): Promise<StoreResult<PullResult>> {
  try { return await pullRefStoreOnce(context, input, onMerged, onApplied); }
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
  }
  return { status: "ok", result: { states: [], pulls } };
}

async function pullRemote(context: RefBackendContext, input: PullInput, designation: RefDesignation,
  remote: RefRemoteDesignation, families: FamilyId[],
  onMerged?: (remote: string, incoming: ReadonlyMap<string, string>) => void, onApplied?: RefMergeOptions["onApplied"]): Promise<PullOutcome | "restart"> {
  const fetched = await fetchRefRemote(context, remote, designation, input.history);
  const prefix = `refs/arc-remotes/${remote.name}/`;
  const incoming = new Map([...(await readSyncRefs(context, prefix))].map(([ref, tip]) =>
    [`refs/arc/${ref.slice(prefix.length)}`, tip] as const).filter(([ref]) => isManifestRef(ref) || HistoryRefSchema.safeParse(ref).success));
  const merged = fetched.status === "refs" && remote.role === "push"
    ? await mergeRefSets(context, await readSyncRefs(context, "refs/arc/"), incoming, { lock: context.lock, onApplied }) : null;
  if (merged?.status === "restart") return "restart";
  if (merged) onMerged?.(remote.name, incoming);
  const common = { remote: remote.name, role: remote.role === "read" ? "read" as const : "state" as const,
    families: remote.role === "read" ? families.filter((family) => FAMILY_REGISTRY[family].scope !== "identity") : families, notices: merged?.notices ?? [] };
  return fetched.status === "unreachable" ? { ...common, status: "failed", failure: {
    code: "unreachable", class: "recoverable", cause: fetched.cause, condition: fetched.stderr || "The state fetch failed.",
    remedy: { text: "Repair remote connectivity or authentication and retry the pull."
      + (context.repository?.gitDir ? ` Transport settings in code-repository config do not reach this store; move them to global Git config or ${context.repository.gitDir}/config.` : "") },
  } } : { ...common, status: fetched.refs.length > 0 || merged?.changed ? "pulled" : "noop" };
}
