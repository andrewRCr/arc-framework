/** Select archived records from immutable check views without rereading live refs. */

import type { RefBackendContext } from "./context.js";
import type { RefViewState } from "./view-state.js";
import type { ListInput, StoreRecord, ListingDiagnostic } from "../read.js";
import { archivedFolders, isArchiveRef, latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import { rootFamily } from "./path-decode.js";
import { decodeCapturedRef } from "./read.js";

/** Decode archived owners, with a prepared live owner superseding its former folders. */
export function archivedViewRecords(context: RefBackendContext, state: RefViewState, input: ListInput): {
  records: StoreRecord[]; diagnostics: ListingDiagnostic[];
} {
  const records: StoreRecord[] = [], diagnostics: ListingDiagnostic[] = [];
  if (!["work-item", "cohort"].includes(rootFamily(input.family))) return { records, diagnostics };
  const folders: ArchivedFolder[] = [];
  for (const [ref, group] of state.refs) {
    if (!isArchiveRef(ref)) continue;
    if (!group.entries) {
      diagnostics.push({ kind: "unreadable", key: ref, condition: "The captured quarter tree is unavailable.",
        remedy: { text: `Restore or fetch the missing objects for ${ref}, then retry.` } });
      continue;
    }
    const parsed = archivedFolders(input.family, ref, group.entries, state.objects);
    diagnostics.push(...parsed.diagnostics);
    folders.push(...parsed.folders);
  }
  for (const folder of latestArchivedFolders(folders)) {
    if (state.refs.has(folder.liveRef)) continue;
    const prepared = state.refs.get(folder.liveRef.replace("refs/arc/", "refs/arc/history/"));
    const decoded = decodeCapturedRef(context, input, folder.liveRef, prepared?.entries ?? folder.entries,
      state.objects, prepared?.metadata ?? folder.metadata, undefined, folder.placement);
    records.push(...decoded.records);
    diagnostics.push(...decoded.diagnostics.map((diagnostic) => ({ ...diagnostic, key: folder.root + diagnostic.key })));
  }
  return { records, diagnostics };
}
