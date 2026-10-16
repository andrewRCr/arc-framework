/** CLI boundary for atomic entry routing and insertion. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";
/** Source/version are supplied for a move; insertion reads the entry from stdin. */
export interface RouteOptions { from?: string; expectedVersion?: string; to: string; section?: string }
/** Move or insert an entry after the store capability flips.
 * @param entryId - Existing entry identity, absent for insertion.
 * @param options - Source, observed version, and destination.
 * @param context - Interaction policy.
 */
export async function handleRoute(entryId: string | undefined, options: RouteOptions, context?: InteractionContext): Promise<void> {
  void entryId; void options;
  await handleDormantStoreCommand("route", true, context);
}
