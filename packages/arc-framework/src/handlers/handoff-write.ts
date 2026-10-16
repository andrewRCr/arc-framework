/** CLI boundary for writing anchored session handoff state. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";
/** Write a versioned handoff request once the store capability flips.
 * @param file - File path or explicit stdin marker.
 * @param context - Interaction policy.
 */
export async function handleHandoffWrite(file: string, context?: InteractionContext): Promise<void> {
  void file;
  await handleDormantStoreCommand("handoff write", true, context);
}
