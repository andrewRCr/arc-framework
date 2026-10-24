/** Decode archive-folder ownership and placement from captured quarter trees. */

import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../kernel/index.js";
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import type { FamilyId } from "../catalog.js";
import type { ReadPlacement } from "../placement.js";
import type { ListingDiagnostic } from "../read.js";
import { rootFamily } from "./path-decode.js";
import { parseRefMetadata, historicalMetadataFailure, unparsedMetadata, type RefMetadata } from "./metadata.js";
import type { RefTreeEntry, BatchObject } from "./batch-read.js";

/** One archived owner with paths relative to its retained live tree layout. */
export interface ArchivedFolder {
  ref: string; root: string; owner: OwnerIdentity; metadata: RefMetadata; placement: ReadPlacement;
  entries: RefTreeEntry[]; liveRef: string;
}

const FOLDER_METADATA = /^metadata-[0-9a-f-]{36}\.json$/u;

/** Identify quarter refs without admitting other namespaces under the prefix. */
export function isArchiveRef(ref: string): boolean { return /^refs\/arc\/archive\/\d{4}-q[1-4]$/u.test(ref); }

/**
 * Select the folders these owners' metadata files name, and any folder no metadata file names, since it could be
 * theirs, without acquiring unrelated record blobs.
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
      if (FOLDER_METADATA.test(name)) attributed.add(root);
      if (names.has(name)) owned.add(root);
    }
    const kept = new Set([...roots].filter((root) => owned.has(root) || !attributed.has(root)));
    const own = entries.filter(({ path }) => kept.has(path.slice(0, path.indexOf("/") + 1)));
    if (own.length) selected.set(ref, own);
  }
  return selected;
}

/** The first quarter holding a folder these owners' metadata files name, or that no metadata file names, whose metadata does not read. */
export function unreadableOwnedFolder(trees: ReadonlyMap<string, readonly RefTreeEntry[]>, owners: readonly OwnerIdentity[],
  objects: ReadonlyMap<string, BatchObject | null>): string | undefined {
  return [...archiveOwnerTrees(trees, owners)].find(([ref, entries]) => (["work-item", "cohort"] as const)
    .some((family) => archivedFolders(family, ref, entries, objects).diagnostics.some(({ kind }) => kind === "unreadable")))?.[0];
}

/** Decode folder metadata independently, retaining one diagnostic for each unreadable owner; a saved quarter names historical repair. */
export function archivedFolders(family: FamilyId, ref: string, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>, saved = false): { folders: ArchivedFolder[]; diagnostics: ListingDiagnostic[] } {
  const folders: ArchivedFolder[] = [], diagnostics: ListingDiagnostic[] = [];
  const familyRoot = rootFamily(family);
  if (familyRoot !== "work-item" && familyRoot !== "cohort") return { folders, diagnostics };
  const quarter = ArchiveQuarterSchema.parse(ref.split("/").at(-1));
  for (const root of new Set(entries.map(({ path }) => path.slice(0, path.indexOf("/") + 1)).filter(Boolean))) {
    const cohort = /^\d+[ab]_cohort-/u.test(root);
    if (cohort !== (familyRoot === "cohort")) continue;
    const members = entries.filter(({ path }) => path.startsWith(root));
    const entry = members.find(({ path }) => FOLDER_METADATA.test(path.slice(root.length)));
    const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
    const placement = folderPlacement(root, metadata, quarter, cohort);
    if (!metadata?.slug || !entry || !placement) {
      diagnostics.push({ kind: "unreadable", key: `${ref}:${root}`, ...unparsedMetadata(`${ref}:${root}`, saved) });
      continue;
    }
    const uid = entry.path.slice(root.length + "metadata-".length, -".json".length);
    const owner = OwnerIdentitySchema.safeParse({ type: familyRoot, name: metadata.slug, uid });
    if (!owner.success) {
      diagnostics.push(malformedFolderOwner(entry.path, saved));
      continue;
    }
    folders.push({ ref, root, owner: owner.data, metadata, placement,
      liveRef: `refs/arc/${cohort ? "cohort" : "work"}/${uid}`, entries: members.map((member) => ({ ...member, path: member.path.slice(root.length) })) });
  }
  return { folders, diagnostics };
}

function malformedFolderOwner(path: string, saved: boolean): ListingDiagnostic {
  return { kind: "malformed", key: path, condition: "The archive metadata filename does not name a valid owner UID.",
    remedy: saved ? historicalMetadataFailure(path).remedy : { text: "Repair the archive folder's metadata path, then retry." } };
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
