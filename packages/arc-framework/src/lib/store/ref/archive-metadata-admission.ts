/** Admit retained source paths before copying them into one owner's archive folder. */
import type { RecordReference } from "../identity.js";
import type { StoreRefusal } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefTreeEntry } from "./batch-read.js";
import { isOwnerMetadataName } from "./metadata-filename.js";

/** Keep an external retained entry from becoming a second owner metadata candidate during archive or refresh. */
export function archiveSourceMetadataRefusal(context: Pick<RefBackendContext, "registry">, reference: RecordReference,
  sourceRef: string, entries: Iterable<RefTreeEntry>): StoreRefusal | undefined {
  const home = expandStoredPath(reference, { registry: context.registry });
  for (const { path } of entries) {
    if (path === home.metadataPath || !isOwnerMetadataName(path.split("/")[0] ?? "")) continue;
    return { code: "record-malformed", class: "recoverable", reference, rule: "store.archive-metadata",
      condition: `The retained source path ${path} on ${sourceRef} is reserved for owner metadata.`,
      remedy: { text: `Rename the reserved source entry to a nested companion path or remove it in a new commit on ${sourceRef}, `
        + "preserving the owner's actual metadata file, then retry the archive or completed update." } };
  }
  return undefined;
}
