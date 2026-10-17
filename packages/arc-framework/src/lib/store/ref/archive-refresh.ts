/** Copy a retained item tree into a completed folder while retaining its lifecycle coordinates. */

import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import type { RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { ArchivedFolder } from "./archive-read.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { RefMetadata } from "./metadata.js";
import { writeRefBlob } from "./tree-write.js";

/** Replace one owner's folder from its final group, preserving that folder's end and placement. */
export async function refreshArchivedFolder(context: RefBackendContext, folder: ArchivedFolder, group: Pick<RefWriteGroup, "entries" | "metadata">,
  entries: Map<string, RefTreeEntry>, reference: RecordReference): Promise<void> {
  const home = expandStoredPath(reference, { registry: context.registry });
  for (const path of entries.keys()) if (path.startsWith(folder.root)) entries.delete(path);
  const metadata: RefMetadata = { ...group.metadata, endBatch: folder.metadata.endBatch };
  if (folder.placement.kind !== "completed") throw new Error("A completed folder has no completed placement");
  if (metadata.placement) metadata.placement = { kind: "completed", quarter: folder.placement.quarter };
  if (metadata.primary) metadata.primary = { ...metadata.primary, placement: { kind: "completed", quarter: folder.placement.quarter } };
  const root = expandStoredPath({ ...reference, owner: { ...reference.owner, name: group.metadata.slug ?? reference.owner.name } }, { registry: context.registry, placement: folder.placement }).root;
  for (const entry of group.entries.values()) {
    if (entry.path === home.manifestPath.slice(0, -1) || entry.path.startsWith(home.manifestPath)) continue;
    const path = root + entry.path;
    entries.set(path, { ...entry, path, ...(entry.path === home.metadataPath ? { oid: await writeRefBlob(context, canonicalize(metadata)) } : {}) });
  }
}
