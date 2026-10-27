/** Decode archive-folder ownership and placement from captured quarter trees. */

import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../kernel/index.js";
import { OwnerIdentitySchema, StoredUidSchema, type OwnerIdentity } from "../identity.js";
import type { FamilyId } from "../catalog.js";
import type { ReadPlacement } from "../placement.js";
import type { ListingDiagnostic } from "../read.js";
import { rootFamily } from "./path-decode.js";
import { parseRefMetadata, historicalMetadataFailure, unparsedMetadata, type RefMetadata } from "./metadata.js";
import type { RefTreeEntry, BatchObject } from "./batch-read.js";
import { isOwnerMetadataName } from "./metadata-filename.js";

/** One archived owner with paths relative to its retained live tree layout. */
export interface ArchivedFolder {
  ref: string; root: string; owner: OwnerIdentity; metadata: RefMetadata; placement: ReadPlacement;
  entries: RefTreeEntry[]; liveRef: string;
}

/** Recognize metadata candidates broadly enough to diagnose an invalid owner UID. */
export const isArchiveMetadataName = isOwnerMetadataName;

/** Identify one archive folder's metadata entry without admitting a nested path. */
export function isArchiveMetadataPath(path: string): boolean {
  const boundary = path.indexOf("/");
  return boundary > 0 && isArchiveMetadataName(path.slice(boundary + 1));
}

/** Identify quarter refs without admitting other namespaces under the prefix. */
export function isArchiveRef(ref: string): boolean { return /^refs\/arc\/archive\/\d{4}-q[1-4]$/u.test(ref); }

/**
 * Select the folders these owners' metadata files name, and any folder without valid UID attribution, since it
 * could be theirs, without acquiring unrelated record blobs.
 */
export function archiveOwnerTrees(trees: ReadonlyMap<string, readonly RefTreeEntry[]>,
  owners: readonly OwnerIdentity[]): Map<string, RefTreeEntry[]> {
  const names = new Set(owners.flatMap(owner => owner.type !== "person" && owner.uid ? [`metadata-${owner.uid}.json`] : []));
  const selected = new Map<string, RefTreeEntry[]>();
  for (const [ref, entries] of trees) {
    const roots = new Set<string>(), attributed = new Set<string>(), owned = new Set<string>();
    for (const { path } of entries) {
      const slash = path.indexOf("/");
      if (slash < 0) continue;
      const root = path.slice(0, slash + 1), name = path.slice(slash + 1);
      roots.add(root);
      if (isArchiveMetadataName(name) && StoredUidSchema.safeParse(name.slice("metadata-".length, -".json".length)).success) attributed.add(root);
      if (names.has(name)) owned.add(root);
    }
    const kept = new Set([...roots].filter((root) => owned.has(root) || !attributed.has(root)));
    const own = entries.filter(({ path }) => !path.includes("/") || kept.has(path.slice(0, path.indexOf("/") + 1)));
    if (own.length) selected.set(ref, own);
  }
  return selected;
}

/** The first diagnostic in an owned or unattributed archive namespace, retaining its exact path and repair. */
export function firstOwnedArchiveDiagnostic(trees: ReadonlyMap<string, readonly RefTreeEntry[]>, owners: readonly OwnerIdentity[],
  objects: ReadonlyMap<string, BatchObject | null>): { ref: string; diagnostic: ListingDiagnostic } | undefined {
  for (const [ref, entries] of archiveOwnerTrees(trees, owners)) for (const family of ["work-item", "cohort"] as const) {
    const diagnostic = archivedFolders(family, ref, entries, objects).diagnostics[0];
    if (diagnostic) return { ref, diagnostic };
  }
}

/** Decode folder metadata independently, retaining one diagnostic for each unreadable owner; a saved quarter names historical repair. */
export function archivedFolders(family: FamilyId, ref: string, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>, saved = false): { folders: ArchivedFolder[]; diagnostics: ListingDiagnostic[] } {
  const folders: ArchivedFolder[] = [], diagnostics: ListingDiagnostic[] = [];
  const familyRoot = rootFamily(family);
  if (familyRoot !== "work-item" && familyRoot !== "cohort") return { folders, diagnostics };
  const quarter = ArchiveQuarterSchema.parse(ref.split("/").at(-1));
  diagnostics.push(...archiveRootDiagnostics(ref, entries, saved));
  for (const root of new Set(entries.map(({ path }) => path.slice(0, path.indexOf("/") + 1)).filter(Boolean))) {
    const decoded = decodeArchiveFolder({ family: familyRoot, ref, quarter, saved }, root, entries, objects);
    if (!decoded) continue;
    if ("kind" in decoded) diagnostics.push(decoded); else folders.push(decoded);
  }
  return { folders, diagnostics };
}

interface ArchiveFolderScope { family: "work-item" | "cohort"; ref: string; quarter: ReturnType<typeof ArchiveQuarterSchema.parse>; saved: boolean }

function decodeArchiveFolder({ family, ref, quarter, saved }: ArchiveFolderScope, root: string,
  entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): ArchivedFolder | ListingDiagnostic | undefined {
  const members = entries.filter(({ path }) => path.startsWith(root));
  const candidates = members.filter(({ path }) => isArchiveMetadataName(path.slice(root.length)));
  if (candidates.length > 1) return ambiguousFolderMetadata(ref, root, candidates, saved);
  const entry = candidates[0];
  const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
  const cohort = metadata?.primary === undefined && (metadata?.placement?.kind === "completed" || /^\d+[ab]_cohort-/u.test(root));
  if (cohort !== (family === "cohort")) return;
  const unreadable: ListingDiagnostic = { kind: "unreadable", key: `${ref}:${root}`, ...unparsedMetadata(`${ref}:${root}`, saved) };
  if (!metadata?.slug || !entry) return unreadable;
  const uid = entry.path.slice(root.length + "metadata-".length, -".json".length);
  const owner = OwnerIdentitySchema.safeParse({ type: family, name: metadata.slug, uid });
  if (!owner.success) return malformedFolderOwner(ref, entry.path, saved);
  const mismatch = folderOwnerMismatch(ref, root, owner.data, metadata, cohort, saved);
  if (mismatch) return mismatch;
  const placement = folderPlacement(root, metadata, quarter, cohort);
  if (!placement) return unreadable;
  return { ref, root, owner: owner.data, metadata, placement,
    liveRef: `refs/arc/${cohort ? "cohort" : "work"}/${uid}`, entries: members.map((member) => ({ ...member, path: member.path.slice(root.length) })) };
}

function ambiguousFolderMetadata(ref: string, root: string, candidates: readonly RefTreeEntry[], saved: boolean): ListingDiagnostic {
  const key = `${ref}:${root}`;
  return { kind: "malformed", key,
    condition: `The archive folder ${key} has ambiguous owner metadata: ${candidates.map(({ path }) => path).join(", ")}.`,
    remedy: saved ? { text: "This saved state contains ambiguous historical owner metadata; a forward repair cannot change an ancestor. "
      + "Repair the current archive folder in a new commit, then select a saved state after repair and retry. Do not infer historical ownership." }
      : { text: `Repair ${key} forward in a new commit: retain exactly one correct owner metadata file and rename or remove the other candidates; then retry.` } };
}

function folderOwnerMismatch(ref: string, root: string, owner: OwnerIdentity, metadata: RefMetadata,
  cohort: boolean, saved: boolean): ListingDiagnostic | undefined {
  const uid = "uid" in owner ? owner.uid ?? "" : "";
  const matches = cohort ? new RegExp(`^\\d+[ab]_cohort-${owner.name}/$`, "u").test(root)
    : metadata.primary?.role === "work-item/record" ? root === `${owner.name}-${uid.slice(0, 8)}/`
      : new RegExp(`^\\d+_${owner.name}/$`, "u").test(root);
  if (matches) return;
  const key = `${ref}:${root}`;
  return { kind: "key-mismatch", key, condition: `The archive folder ${key} disagrees with its metadata's role or owner coordinates.`,
    remedy: saved ? historicalMetadataFailure(key).remedy : {
      text: `Restore the folder name at ${key} from its owner's slug and UID suffix or cohort role, preserving its assigned quarter and sequence, in a new commit; then retry.`,
    } };
}

function archiveRootDiagnostics(ref: string, entries: readonly RefTreeEntry[], saved: boolean): ListingDiagnostic[] {
  return entries.filter(({ path }) => !path.includes("/")).map(({ path }) => {
    const key = `${ref}:${path}`;
    return { kind: "malformed", key, condition: `The archive entry ${key} is outside an owner folder.`,
      remedy: saved ? historicalMetadataFailure(key).remedy
        : { text: `Restore ${key} to its correct archive owner folder or remove the stray entry in a new commit, then retry.` } };
  });
}

function malformedFolderOwner(ref: string, path: string, saved: boolean): ListingDiagnostic {
  const key = `${ref}:${path}`;
  return { kind: "malformed", key, condition: `The archive metadata filename ${key} does not name a valid owner UID.`,
    remedy: saved ? historicalMetadataFailure(key).remedy
      : { text: `Restore the correct owner UID in the archive metadata path ${key}, then retry.` } };
}

/** Choose one complete folder per owner, by later quarter then higher sequence. */
export function latestArchivedFolders(folders: readonly ArchivedFolder[]): ArchivedFolder[] {
  const selected = new Map<string, ArchivedFolder>();
  for (const folder of folders) {
    const prior = selected.get(folder.liveRef);
    if (!prior || folder.ref > prior.ref || folder.ref === prior.ref && folderSequence(folder) > folderSequence(prior)) selected.set(folder.liveRef, folder);
  }
  return [...selected.values()];
}

/** The placement of an ended owner's latest folder, which defines its completed placement and version. */
export function latestFolderPlacement(folders: readonly ArchivedFolder[], historyRef: string): ReadPlacement | undefined {
  if (!historyRef.startsWith("refs/arc/history/")) return undefined;
  const live = historyRef.replace("refs/arc/history/", "refs/arc/");
  return latestArchivedFolders(folders.filter(({ liveRef }) => liveRef === live))[0]?.placement;
}

function folderSequence(folder: ArchivedFolder): bigint {
  return BigInt("sequence" in folder.placement ? folder.placement.sequence : "0");
}

function folderPlacement(root: string, metadata: RefMetadata | null, quarter: ReturnType<typeof ArchiveQuarterSchema.parse>,
  cohort: boolean): ReadPlacement | null {
  const stored = cohort ? metadata?.placement : metadata?.primary?.placement;
  if (stored?.kind !== "completed" || stored.quarter !== quarter) return null;
  if (!cohort && metadata?.primary?.role === "work-item/record") return stored;
  const match = /^(\d+)([ab])?_/u.exec(root);
  const sequence = ArchiveSequenceSchema.safeParse(match?.[1]);
  if (!sequence.success) return null;
  if (cohort) return match?.[2] === "a" || match?.[2] === "b" ? { ...stored, sequence: sequence.data, closeout: match[2] } : null;
  return { ...stored, sequence: sequence.data };
}
