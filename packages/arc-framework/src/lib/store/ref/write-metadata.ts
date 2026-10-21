/** Stage final publication metadata without changing the prepared admission views. */
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { completedFolderMetadata } from "./archive-refresh.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { ResolvedBatch } from "./write-resolution.js";
import { writeRefBlob } from "./tree-write.js";

/** Include prospective group and completed-folder metadata in the existing verified blob batch. */
export async function stagePublicationMetadata(context: RefBackendContext, batch: ResolvedBatch,
  groups: ReadonlyMap<string, RefWriteGroup>, completed: ReadonlyMap<string, RefWriteGroup>): Promise<void> {
  if (context.writeEvidence && context.blobStage) context.writeEvidence.format = context.blobStage.format;
  for (const group of [...groups.values(), ...completed.values()]) await writeRefBlob(context, canonicalize(group.metadata));
  for (const folder of batch.archived ?? []) {
    const group = completed.get(folder.liveRef.replace("refs/arc/", "refs/arc/history/"));
    if (group && !group.viewRef) await writeRefBlob(context, canonicalize(completedFolderMetadata(folder, group.metadata)));
  }
}
