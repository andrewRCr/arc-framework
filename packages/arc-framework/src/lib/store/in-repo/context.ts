/** Operation dependencies and parser registration for the repository adapter. */

import { parseMetaRecord } from "../../active/meta-reader.js";
import { createKindRegistry, type KindDefinition } from "../registry.js";
import type { KindId } from "../catalog.js";
import type { StorePorts } from "../ports.js";

/** Backend-local context; each operation reads current state rather than retaining a snapshot. */
export interface InRepoContext {
  ports: StorePorts;
  registry: Readonly<Record<KindId, KindDefinition>>;
}
/** Install the parser the lifecycle consumers share without reading any record.
 * @param ports - Explicit composition dependencies.
 * @returns The backend's independent parser registry and ports.
 */
export function createInRepoContext(ports: StorePorts): InRepoContext {
  return { ports, registry: createKindRegistry({
    "work-item/meta": (content) => {
      try { return { success: true, data: parseMetaRecord(content) }; }
      catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) }; }
    },
  }) };
}
