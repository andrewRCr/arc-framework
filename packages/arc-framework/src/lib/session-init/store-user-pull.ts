/** Session-entry store synchronization, independent of the retired notes channel. */
import { z } from "zod";
import type { Store } from "../store/contract.js";
import { PullResultSchema, type PullResult, type StoreSyncPort } from "../store/operational-sync.js";
import { SessionActionsSchema } from "./actions.js";

/** Complete off-branch user slot; it contains no notes fields. */
export const StoreSessionInitUserValueSchema = z.union(PullResultSchema.options.map(schema => schema.extend({
  summary: z.string(), actions: SessionActionsSchema.optional(),
})));
/** Off-branch user slot with one orientation line and any executable remedy. */
export type StoreSessionInitUserValue = PullResult & { summary: string; actions?: z.infer<typeof SessionActionsSchema> };

/** Produce the shared orientation and typed action for a pull outcome. */
export function describeStorePull(result: PullResult): StoreSessionInitUserValue {
  if (result.status === "designation-needed") return { ...result,
    summary: `Remote ${result.remote} needs a store designation. ${result.remedy.text}`,
    actions: [{ ...result.remedy, argv: [...result.remedy.argv] }] };
  if (result.status === "unreachable") return { ...result, summary: result.condition, actions: [{ ...result.remedy }] };
  return { ...result, summary: ({ "no-remote": "No state remote is configured.", "no-identity": "No store identity is configured. Run git config arc.identity <name> and retry.",
    pulled: "Store state pulled.", noop: "Store state is current." })[result.status] };
}

/** Pull only after the flip, when remote sync and a backend binding are present. */
export async function probeStoreUserPull(input: { store: Store; remoteSyncEnabled: boolean; sync?: StoreSyncPort }): Promise<StoreSessionInitUserValue | null> {
  if (!input.store.capabilities.stateOffBranch || !input.remoteSyncEnabled || input.sync === undefined) return null;
  return describeStorePull(await input.sync.pull());
}
