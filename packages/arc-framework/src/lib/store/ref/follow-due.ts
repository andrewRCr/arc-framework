/** Detect fetched forwarding records before permitting ordinary remote designation changes. */
import type { Store } from "../contract.js";
import { answerRefFollow } from "./follow.js";
import { remoteView } from "./remote-setting.js";
import type { StoreRemoteResult, MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { judgeRefFollow, type RefFollowJudgment } from "./follow-candidates.js";

/** One active fetched source whose tracking record keeps its follow due. */
export interface RefFollowDue { remote: RefRemoteDesignation; designation: RefDesignation; trackingRef: string; tip: string }
/** A withdrawn follow leaves its completed account for the ordinary setting's result. */
export interface StaleFollowAccount { status: "stale"; report: MigrateReport }

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
export async function guardRefFollowSetting(context: RefBackendContext, store: Store, remote: string, role: "push" | "read" | "off"): Promise<StoreRemoteResult | StaleFollowAccount | null> {
  const due = await readRefFollowDue(context);
  if (!due) return null;
  const oldOff = remote === due.remote.name && role === "off";
  if (oldOff && due.remote.repository === "code") return null;
  const judged = await judgeRefFollow(context, due);
  if (oldOff && !hasFollowAnswer(judged, remote)) return turnOffDepartedBacking(context);
  if (judged.status === "none") return judged.report ? { status: "stale", report: judged.report } : null;
  if (judged.status === "refused") return judged;
  if (judged.accepted.some(candidate => candidate.remote.name === remote)) return answerKnownFollow(context, store, due, judged, remote, role);
  return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `State moved from ${due.remote.name}; follow that move before changing another designation.`,
    remedy: { text: `Run arc store migrate to follow, or arc store remote ${due.remote.name} off to stop fetching its state.`, argv: ["arc", "store", "migrate"] } } };
}

function hasFollowAnswer(judged: RefFollowJudgment, remote: string): boolean {
  return judged.status === "decided" && judged.accepted.some(candidate => candidate.remote.name === remote) &&
    !(judged.accepted.length === 1 && judged.result.status === "refused");
}

async function turnOffDepartedBacking(context: RefBackendContext): Promise<StoreRemoteResult> {
  const physical = await readRefRepository(context);
  await physical.exec("git", ["config", "remote.backing.arc-state", "off"], { cwd: physical.checkoutRoot });
  return { status: "ok", result: await remoteView(context) };
}

async function answerKnownFollow(context: RefBackendContext, store: Store, due: RefFollowDue,
  judged: Extract<RefFollowJudgment, { status: "decided" }>, remote: string, role: "push" | "read" | "off"): Promise<StoreRemoteResult | StaleFollowAccount | null> {
  if (judged.accepted.length === 1 && judged.result.status === "refused") return judged.result;
  const selected = judged.accepted.find(candidate => candidate.remote.name === remote);
  if (!selected) throw new Error("The accepted follow answer has no candidate");
  const followed = await answerRefFollow(context, store, due, judged, selected, role);
  if (followed.status === "stale") return followed;
  if (followed.status === "refused") return followed;
  return { status: "ok", result: { ...await remoteView(context), report: followed.result } };
}
