/** CLI boundary for the person's reference-based Errand queue. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";
/** List the queue once the store capability flips.
 * @param options - Output mode.
 * @param context - Interaction policy.
 */
export async function handleErrandQueue(options: { json?: boolean }, context?: InteractionContext): Promise<void> {
  await handleDormantStoreCommand("errand queue", options.json === true, context);
}
/** Replace the whole queue from a versioned request once the capability flips.
 * @param file - File path or explicit stdin marker.
 * @param context - Interaction policy.
 */
export async function handleErrandQueueSet(file: string, context?: InteractionContext): Promise<void> {
  void file;
  await handleDormantStoreCommand("errand queue set", true, context);
}
