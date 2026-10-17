/** Transport repair guidance for the repository whose configuration Git actually reads. */

import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";

/** Explain repository transport configuration and a timed-out push's hook budget. */
export function refSyncTransportRemedy(context: RefBackendContext, operation: "pull" | "push", timedOut = false): Remedy {
  return { text: `Repair remote connectivity or authentication and retry the ${operation}.`
    + (operation === "push" && timedOut ? " A pre-push hook runs inside this deadline; repair a slow hook or let it pass refs/arc/* alone using the remote ref names Git supplies on standard input." : "")
    + (context.repository?.gitDir ? ` Transport settings in code-repository config do not reach this store; move them to global Git config or ${context.repository.gitDir}/config.` : "") };
}
