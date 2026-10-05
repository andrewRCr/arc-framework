/** Operation dependencies and parser registration for the repository adapter. */

import { parseMetaRecord } from "../../active/meta-reader.js";
import { createKindRegistry, type KindDefinition } from "../registry.js";
import type { KindId } from "../catalog.js";
import type { StorePorts } from "../ports.js";
import type { MetaSource } from "./meta.js";

/** Backend-local dependencies; live operations always read current state. */
export interface InRepoContext {
  ports: StorePorts;
  registry: Readonly<Record<KindId, KindDefinition>>;
  /** Full object-ID width established by the saved-state producer for this repository. */
  savedObjectIdLength?: number;
  /** At most one complete inventory of an immutable saved tree, never a moving ref. */
  savedMetaInventory?: { revision: string; sources: MetaSource[] };
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
