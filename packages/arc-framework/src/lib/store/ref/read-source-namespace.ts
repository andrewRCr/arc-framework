/** Translate only ref coordinates between a read source and the engine's logical namespace. */

import type { RefBackendContext } from "./context.js";

/** Map a logical ref or ref-qualified object query without touching record bytes. */
export function physicalReadRef(context: RefBackendContext, ref: string): string {
  return context.readSource && ref.startsWith("refs/arc/") ? context.readSource.root + ref.slice("refs/arc/".length) : ref;
}

/** Present acquired source refs through the ordinary record-addressing model. */
export function logicalReadRef(context: RefBackendContext, ref: string): string {
  return context.readSource && ref.startsWith(context.readSource.root) ? "refs/arc/" + ref.slice(context.readSource.root.length) : ref;
}

/** Bind the same engine to a remote's tracking refs and independent manifest keeper. */
export function readSourceContext(context: RefBackendContext, remote: string): RefBackendContext {
  return { ...context, readSource: { root: `refs/arc-remotes/${remote}/`, versionRef: `refs/arc/tmp/read/${remote}/version` } };
}
