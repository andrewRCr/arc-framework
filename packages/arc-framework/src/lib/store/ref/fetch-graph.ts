/** Contain confirmed unavailable fetch graphs without treating unrelated executor failures as divergence. */
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import { isUnavailableGraphFailure } from "./history-graph.js";
import { corruptRef } from "./namespace-health.js";
import { syncRefIsAncestor } from "./sync-graph.js";

/** A completed ancestry observation, or null when its missing graph was independently confirmed. */
export async function fetchedRefIsAncestor(context: RefBackendContext, older: string, newer: string): Promise<boolean | null> {
  try { return await syncRefIsAncestor(context, older, newer); }
  catch (error) {
    if (!await isUnavailableGraphFailure(context, error)) throw error;
    return null;
  }
}

/** Compare both captured tips without inventing divergence from unavailable evidence. */
export async function compareFetchedRefTips(context: RefBackendContext, held: string, fetched: string): Promise<"related" | "diverged" | "unavailable"> {
  const forward = await fetchedRefIsAncestor(context, held, fetched);
  if (forward === null) return "unavailable";
  if (forward) return "related";
  const backward = await fetchedRefIsAncestor(context, fetched, held);
  return backward === null ? "unavailable" : backward ? "related" : "diverged";
}

/** Withhold this logical state coordinate while preserving its trusted local comparison basis. */
export function unavailableFetchGraphNotice(ref: string): PullNotice {
  const refusal = corruptRef(ref, true);
  return { kind: "namespace-corrupt", ref, condition: refusal.condition, remedy: refusal.remedy };
}
