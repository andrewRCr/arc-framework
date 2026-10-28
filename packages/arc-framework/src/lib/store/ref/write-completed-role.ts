/** Plan distinct readable archive coordinates for every completed primary refresh. */
import type { ReadPlacement } from "../placement.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import { latestArchivedFolders, type ArchivedFolder } from "./archive-read.js";
import { findArchiveRootOccupant } from "./archive-root-occupancy.js";
import { ownerPrimaryReference } from "./archive-refresh.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";
import { nextArchiveSequence } from "./write-archive.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { ResolvedBatch } from "./write-resolution.js";

/** Every retained folder of one item whose completed primary will be refreshed. */
export interface CompletedRoleReplacement {
  group: Pick<RefWriteGroup, "metadata" | "completedPlacements" | "readPlacement">;
  role: "work-item/meta" | "work-item/record"; folders: ArchivedFolder[];
}

/** Quarter transfers have their own plan; reopens remove their old folders altogether. */
export function completedRoleReplacements(batch: ResolvedBatch, groups: ReadonlyMap<string, RefWriteGroup>,
  transfers: ReadonlySet<string>): CompletedRoleReplacement[] {
  const selected = new Map<string, CompletedRoleReplacement>();
  for (const folder of batch.archived ?? []) {
    const history = folder.liveRef.replace("refs/arc/", "refs/arc/history/"), group = groups.get(history);
    const role = group?.metadata.primary?.role;
    if (!group || !role || group.viewRef || transfers.has(history)) continue;
    let replacement = selected.get(history);
    if (!replacement) { replacement = { group, role, folders: [] }; selected.set(history, replacement); }
    replacement.folders.push(folder);
  }
  return [...selected.values()];
}

/** Reserve each folder independently and expose the final latest placement to write checks. */
export function planCompletedRoleReplacements(context: Pick<RefBackendContext, "registry">, replacements: readonly CompletedRoleReplacement[],
  quarters: ReadonlyMap<string, Map<string, RefTreeEntry>>, preferred: readonly ArchivedFolder[] = []): StoreResult<undefined> {
  const occupied = new Set<string>();
  for (const { group, role, folders } of replacements) {
    const placements = new Map<string, ReadPlacement>(), planned: ArchivedFolder[] = [];
    for (const folder of folders) {
      const target = quarters.get(folder.ref);
      if (!target) throw new Error("A completed role replacement has no captured quarter");
      const placement = replacementPlacement(preferredRoleFolder(folder, role, preferred) ?? folder, role, target);
      const reference = ownerPrimaryReference(folder.owner, group.metadata);
      const home = expandStoredPath(reference, { registry: context.registry, placement });
      const key = `${folder.ref}:${home.root}`;
      if (occupied.has(key) || home.root !== folder.root && findArchiveRootOccupant(home.root, target.keys()) !== undefined) {
        return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
          rule: "store.ended-twice-placement", condition: "Refreshing this completed primary would collapse independent archived ends into one folder.",
          remedy: { text: "Remove terminal lineage where present, then reopen the item to remove every archived folder, apply the intended edit, and end it once." } } };
      }
      occupied.add(key);
      placements.set(`${folder.ref}:${folder.root}`, placement);
      planned.push({ ...folder, placement, root: home.root });
      target.set(home.metadataPath, { path: home.metadataPath, mode: "100644", oid: "" });
    }
    group.completedPlacements = placements;
    group.readPlacement = latestArchivedFolders(planned)[0]?.placement;
  }
  return { status: "ok", result: undefined };
}

function preferredRoleFolder(folder: ArchivedFolder, role: CompletedRoleReplacement["role"],
  preferred: readonly ArchivedFolder[]): ArchivedFolder | undefined {
  return preferred.find(candidate => candidate.ref === folder.ref && candidate.liveRef === folder.liveRef
    && candidate.metadata.primary?.role === role
    && (candidate.metadata.endBatch ?? candidate.root) === (folder.metadata.endBatch ?? folder.root));
}

function replacementPlacement(folder: ArchivedFolder, role: CompletedRoleReplacement["role"],
  target: ReadonlyMap<string, RefTreeEntry>): ReadPlacement {
  if (folder.placement.kind !== "completed") throw new Error("A retained archive folder has no completed placement");
  if (role === "work-item/record") return { kind: "completed", quarter: folder.placement.quarter };
  if (folder.metadata.primary?.role === "work-item/meta") return folder.placement;
  return { kind: "completed", quarter: folder.placement.quarter, sequence: nextArchiveSequence(target.values()) };
}
