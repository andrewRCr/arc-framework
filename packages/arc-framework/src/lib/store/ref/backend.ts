/** Entry point for the ref-backed operational state implementation. */

import type { Store } from "../contract.js";
import type { RefStorePorts } from "../ports.js";
import { createRefBackendContext, type RefBackendContext } from "./context.js";

/** Construct the backend with no commands, file reads, or resolved policy ports. */
export function createRefBackend(ports: RefStorePorts): Store {
  const context = createRefBackendContext(ports);
  return {
    capabilities: { stateOffBranch: true },
    read: pending("read", context), list: pending("list", context),
    write: pending("write", context), batch: pending("batch", context), version: pending("version", context),
    history: pending("history", context), changes: pending("changes", context), lookup: pending("lookup", context),
    pull: pending("pull", context), push: pending("push", context), maintain: pending("maintain", context),
  };
}

function pending(operation: string, context: RefBackendContext): () => Promise<never> {
  return () => Promise.reject(new Error(`${operation} is not implemented for the ref store at ${context.checkoutRoot}`));
}
