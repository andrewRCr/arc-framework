/** One captured-folder and ended-owner selection rule for current, saved, and prepared reads. */
import type { FamilyId } from "../catalog.js";
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import type { ListingDiagnostic } from "../read.js";
import { archiveOwnerTrees, archivedFolders, isArchiveRef, latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { corruptRef } from "./namespace-health.js";
import { rootFamily } from "./path-decode.js";
import type { RefViewState } from "./view-state.js";

/** Folder decoding retains every end until a caller explicitly selects currently readable owners. */
export interface CapturedArchiveFolders { folders: ArchivedFolder[]; diagnostics: ListingDiagnostic[] }

/** Keep all captured ref names, including unavailable and empty live refs whose presence supersedes folders. */
export function archiveStateFromCapture(tips: ReadonlyMap<string, string>, trees: ReadonlyMap<string, readonly RefTreeEntry[]>,
  objects: ReadonlyMap<string, BatchObject | null>, saved = false): RefViewState {
  return { refs: new Map([...tips.keys()].map(ref => [ref, { entries: trees.get(ref) }])), objects, saved };
}

/** Decode relevant quarter folders without discarding repeated ends or their original diagnostics. */
export function captureArchivedFolders(state: RefViewState, family: FamilyId,
  owners?: readonly OwnerIdentity[]): CapturedArchiveFolders {
  const folders: ArchivedFolder[] = [], diagnostics: ListingDiagnostic[] = [];
  if (!["work-item", "cohort"].includes(rootFamily(family))) return { folders, diagnostics };
  const quarters = new Map([...state.refs].flatMap(([ref, group]) => isArchiveRef(ref) && group.entries
    ? [[ref, group.entries] as const] : []));
  const selected = owners ? archiveOwnerTrees(quarters, owners) : quarters;
  for (const [ref, group] of state.refs) {
    if (!isArchiveRef(ref)) continue;
    if (!group.entries) {
      diagnostics.push(archiveDiagnostic(ref, true, state.saved));
      continue;
    }
    const parsed = archivedFolders(family, ref, selected.get(ref) ?? [], state.objects, state.saved);
    folders.push(...parsed.folders); diagnostics.push(...parsed.diagnostics);
  }
  return { folders, diagnostics };
}

/** Select the latest ended owner unless its live ref stands, overlaying an exact prepared history when supplied. */
export function selectEndedOwners(state: RefViewState, captured: CapturedArchiveFolders): CapturedArchiveFolders {
  const folders: ArchivedFolder[] = [], diagnostics = [...captured.diagnostics];
  for (const folder of latestArchivedFolders(captured.folders)) {
    if (state.refs.has(folder.liveRef)) continue;
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/");
    // Captures contain manifest refs alone; history groups enter only through the complete prepared overlay.
    const prepared = state.refs.get(history);
    if (!prepared) { folders.push(folder); continue; }
    if (!prepared.entries || !prepared.metadata) {
      diagnostics.push(archiveDiagnostic(history, !prepared.entries, state.saved));
      continue;
    }
    const owner = OwnerIdentitySchema.safeParse({ ...folder.owner, name: prepared.metadata.slug });
    if (!owner.success) { diagnostics.push(archiveDiagnostic(history, false, state.saved)); continue; }
    folders.push({ ...folder, entries: [...prepared.entries], metadata: prepared.metadata, owner: owner.data,
      placement: prepared.readPlacement ?? folder.placement });
  }
  return { folders, diagnostics };
}

function archiveDiagnostic(ref: string, missing: boolean, saved = false): ListingDiagnostic {
  const { condition, remedy } = corruptRef(ref, missing, saved);
  return { kind: "unreadable", key: ref, condition, remedy };
}
