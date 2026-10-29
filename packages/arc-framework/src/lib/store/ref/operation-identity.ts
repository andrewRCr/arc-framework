/** One public operation's identity, resolved on first use and reused for the rest of that operation. */

import type { RefBackendContext } from "./context.js";

/**
 * Scope identity resolution to one public operation, its retries and nested pulls included.
 * @param context - The context the operation starts from; contexts derived from the result share its answer.
 * @returns The same context whose identity resolves at most once.
 */
export function withOperationIdentity<Context extends RefBackendContext>(context: Context): Context {
  let resolved: ReturnType<RefBackendContext["identity"]> | undefined;
  return { ...context, identity: () => resolved ??= context.identity() };
}
