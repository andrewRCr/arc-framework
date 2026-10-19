/** Detect fetched forwarding records before permitting ordinary remote designation changes. */
import type { StoreRemoteResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { judgeRefFollow } from "./follow-candidates.js";

/** One active fetched source whose tracking record keeps its follow due. */
export interface RefFollowDue { remote: RefRemoteDesignation; designation: RefDesignation; trackingRef: string; tip: string }

/** Off remotes retain their tracking objects but no longer require a follow. */
export async function readRefFollowDue(context: RefBackendContext): Promise<RefFollowDue | null> {
  const physical = await readRefRepository(context);
  const designation = await readRefDesignation(context, physical.repository?.commonDir);
  const tracking = await readSyncRefs(physical, "refs/arc-remotes/");
  for (const remote of designation.remotes) {
    if (remote.role !== "read" && remote.role !== "push") continue;
    const trackingRef = `refs/arc-remotes/${remote.name}/project/moved`, tip = tracking.get(trackingRef);
    if (tip) return { remote, designation, trackingRef, tip };
  }
  return null;
}

/** A pending follow owns designation; disabling its old remote remains an independent escape route. */
export async function guardRefFollowSetting(context: RefBackendContext, remote: string, role: "push" | "read" | "off"): Promise<StoreRemoteResult | null> {
  const due = await readRefFollowDue(context);
  if (!due || remote === due.remote.name && role === "off") return null;
  const judged = await judgeRefFollow(context, due);
  if (judged.status === "none") return null;
  if (judged.status === "refused") return judged;
  if (judged.accepted.some(candidate => candidate.remote.name === remote)) {
    if (judged.accepted.length === 1 && judged.result.status === "refused") return judged.result;
    return { status: "refused", refusal: { code: "unsupported", class: "terminal",
      condition: "Answering a follow's destination question is not implemented yet.",
      remedy: { text: "Run arc store migrate to inspect the follow, or turn its departed remote off." } } };
  }
  return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `State moved from ${due.remote.name}; follow that move before changing another designation.`,
    remedy: { text: `Run arc store migrate to follow, or arc store remote ${due.remote.name} off to stop fetching its state.`, argv: ["arc", "store", "migrate"] } } };
}
