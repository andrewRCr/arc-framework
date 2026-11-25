/** Retain imported completed owners on history refs and copy their files under original quarter coordinates. */
import type { RefBackendContext } from "../context.js";
import type { ImportGroup } from "./groups.js";
import type { RefTreeEntry } from "../batch-read.js";
import type { RecordReference } from "../../identity.js";
import { expandStoredPath } from "../../stored-path.js";

/** Many owners contribute separate folders to one landing commit per quarter. */
export interface ImportQuarter { reference: RecordReference; entries: Map<string, RefTreeEntry> }

/** Preserve source numbering and closeout letters instead of invoking the archive number allocator. */
export function addImportArchive(context: RefBackendContext, ref: string, group: ImportGroup, tip: string,
  refs: Map<string, string>, quarters: Map<string, ImportQuarter>): void {
  const home = expandStoredPath(group.reference, { registry: context.registry, placement: group.placement });
  refs.set(ref.replace("refs/arc/", "refs/arc/history/"), tip);
  let quarter = quarters.get(home.ref);
  if (!quarter) { quarter = { reference: group.reference, entries: new Map() }; quarters.set(home.ref, quarter); }
  const folder = home.metadataPath.slice(0, -group.metadataPath.length);
  for (const entry of group.entries.values()) {
    const path = folder + entry.path;
    quarter.entries.set(path, { ...entry, path });
  }
}
