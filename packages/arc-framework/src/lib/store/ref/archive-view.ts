/** Select archived records from immutable check views without rereading live refs. */

import type { RefBackendContext } from "./context.js";
import type { RefViewState } from "./view-state.js";
import type { ListInput, StoreRecord, ListingDiagnostic } from "../read.js";
import { decodeCapturedRef } from "./read.js";
import { captureArchivedFolders, selectEndedOwners } from "./ended-owners.js";

/** Decode archived owners, with a prepared live owner superseding its former folders. */
export function archivedViewRecords(context: RefBackendContext, state: RefViewState, input: ListInput): {
  records: StoreRecord[]; diagnostics: ListingDiagnostic[];
} {
  const records: StoreRecord[] = [];
  const { folders, diagnostics } = selectEndedOwners(state, captureArchivedFolders(state, input.family));
  for (const folder of folders) {
    const decoded = decodeCapturedRef(context, input, folder.liveRef, folder.entries,
      state.objects, folder.metadata, undefined, folder.placement, state.saved);
    records.push(...decoded.records);
    diagnostics.push(...decoded.diagnostics.map((diagnostic) => ({ ...diagnostic, key: folder.root + diagnostic.key })));
  }
  return { records, diagnostics };
}
