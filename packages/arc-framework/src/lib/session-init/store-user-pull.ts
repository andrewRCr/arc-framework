/** Session-entry store synchronization, independent of the retired notes channel. */
import { z } from "zod";
import type { Store } from "../store/contract.js";
import { PullResultSchema, pullResultNotices, type PullResult, type StoreSyncPort } from "../store/operational-sync.js";
import { SessionActionsSchema } from "./actions.js";

/** Complete off-branch user slot; it contains no notes fields. */
export const StoreSessionInitUserValueSchema = z.union(PullResultSchema.options.map(schema => schema.extend({
  summary: z.string(), actions: SessionActionsSchema.optional(),
})));
/** Off-branch user slot with one orientation line and any executable remedy. */
export type StoreSessionInitUserValue = PullResult & { summary: string; actions?: z.infer<typeof SessionActionsSchema> };

/** Produce the shared orientation and typed action for a pull outcome. */
export function describeStorePull(result: PullResult): StoreSessionInitUserValue {
  const actions = pullActions(result);
  return { ...result, summary: pullSummary(result), ...(actions.length ? { actions } : {}) };
}

function pullSummary(result: PullResult): string {
  switch (result.status) {
    case "designation-needed": return `Remote ${result.remote} needs a store designation. ${result.remedy.text}`;
    case "unreachable": case "incomplete": return result.condition;
    case "no-identity": return result.remedy ? `No store identity is configured. ${result.remedy.text}`
      : "No store identity is configured. Run git config arc.identity <name> and retry.";
    case "no-remote": return "No state remote is configured.";
    case "pulled": return "Store state pulled.";
    case "noop": return "Store state is current.";
  }
}

function pullActions(result: PullResult): z.infer<typeof SessionActionsSchema> {
  const partial = "partial" in result ? result.partial : undefined;
  const remedies = [
    ...("remedy" in result && result.remedy ? [result.remedy] : []),
    ...(partial?.states.flatMap(state => "remedy" in state ? [state.remedy] : []) ?? []),
    ...(partial?.pulls.flatMap(pull => pull.status === "failed" ? [pull.failure.remedy] : []) ?? []),
    ...pullResultNotices(result).map(notice => notice.remedy),
  ];
  return [...new Map(remedies.map(remedy => [JSON.stringify(remedy), remedy])).values()];
}

/** Pull only after the flip, when remote sync and a backend binding are present. */
export async function probeStoreUserPull(input: { store: Store; remoteSyncEnabled: boolean; sync?: StoreSyncPort }): Promise<StoreSessionInitUserValue | null> {
  if (!input.store.capabilities.stateOffBranch || !input.remoteSyncEnabled || input.sync === undefined) return null;
  return describeStorePull(await input.sync.pull());
}
