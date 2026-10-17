/** Transport repair guidance for the repository whose configuration Git actually reads. */

import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";

/** Explain the separate store's transport configuration boundary on unreachable sync. */
export function refSyncTransportRemedy(context: RefBackendContext, operation: "pull" | "push"): Remedy {
  return { text: `Repair remote connectivity or authentication and retry the ${operation}.`
    + (context.repository?.gitDir ? ` Transport settings in code-repository config do not reach this store; move them to global Git config or ${context.repository.gitDir}/config.` : "") };
}
