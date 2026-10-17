/** Decode archive-folder ownership and placement from captured quarter trees. */

import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../kernel/index.js";
import { OwnerIdentitySchema, type OwnerIdentity } from "../identity.js";
import type { FamilyId } from "../catalog.js";
import type { ReadPlacement } from "../placement.js";
import type { ListingDiagnostic } from "../read.js";
import { rootFamily } from "./path-decode.js";
import { parseRefMetadata, metadataFailure, type RefMetadata } from "./metadata.js";
import type { RefTreeEntry, BatchObject } from "./batch-read.js";

/** One archived owner with paths relative to its retained live tree layout. */
export interface ArchivedFolder {
  ref: string; root: string; owner: OwnerIdentity; metadata: RefMetadata; placement: ReadPlacement;
  entries: RefTreeEntry[]; liveRef: string;
}

/** Identify quarter refs without admitting other namespaces under the prefix. */
export function isArchiveRef(ref: string): boolean { return /^refs\/arc\/archive\/\d{4}-q[1-4]$/u.test(ref); }

/** Decode folder metadata independently, retaining one diagnostic for each unreadable owner. */
export function archivedFolders(family: FamilyId, ref: string, entries: readonly RefTreeEntry[],
  objects: ReadonlyMap<string, BatchObject | null>): { folders: ArchivedFolder[]; diagnostics: ListingDiagnostic[] } {
  const folders: ArchivedFolder[] = [], diagnostics: ListingDiagnostic[] = [];
  const familyRoot = rootFamily(family);
  if (familyRoot !== "work-item" && familyRoot !== "cohort") return { folders, diagnostics };
  const quarter = ArchiveQuarterSchema.parse(ref.split("/").at(-1));
  for (const root of new Set(entries.map(({ path }) => path.slice(0, path.indexOf("/") + 1)).filter(Boolean))) {
    const cohort = /^\d+[ab]_cohort-/u.test(root);
    if (cohort !== (familyRoot === "cohort")) continue;
    const members = entries.filter(({ path }) => path.startsWith(root));
    const entry = members.find(({ path }) => /^metadata-[0-9a-f-]{36}\.json$/u.test(path.slice(root.length)));
    const metadata = parseRefMetadata(entry ? objects.get(entry.oid) : undefined);
    const placement = folderPlacement(root, metadata, quarter, cohort);
    if (!metadata?.slug || !entry || !placement) {
      diagnostics.push({ kind: "unreadable", key: `${ref}:${root}`, ...metadataFailure(`${ref}:${root}`) });
      continue;
    }
    const uid = entry.path.slice(root.length + "metadata-".length, -".json".length);
    const owner = OwnerIdentitySchema.safeParse({ type: familyRoot, name: metadata.slug, uid });
    if (!owner.success) {
      diagnostics.push({ kind: "malformed", key: entry.path, condition: "The archive metadata filename does not name a valid owner UID.",
        remedy: { text: "Repair the archive folder's metadata path, then retry." } });
      continue;
    }
    folders.push({ ref, root, owner: owner.data, metadata, placement,
      liveRef: `refs/arc/${cohort ? "cohort" : "work"}/${uid}`, entries: members.map((member) => ({ ...member, path: member.path.slice(root.length) })) });
  }
  return { folders, diagnostics };
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
