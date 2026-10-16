/** CLI boundary for store-backed inbox listings. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";
/** Inbox listing options. */
export interface InboxOptions { target?: string; json?: boolean }
/** List one semantic inbox once the store capability flips.
 * @param list - Personal, project, or a work-item name.
 * @param options - Target filter and output mode.
 * @param context - Interaction policy.
 */
export async function handleInbox(list: string, options: InboxOptions, context?: InteractionContext): Promise<void> {
  void list;
  await handleDormantStoreCommand("inbox", options.json === true, context);
}
