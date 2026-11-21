/** Separate copy namespace coverage from the disposition and recovery authority of each name. */
import { parseAsideFile } from "./aside.js";
import { coversArchivePath } from "./archive-work.js";
import { uninspectedArchiveCopy, type UninspectedCopies } from "./aside-discovery.js";
import type { ArchiveCopyScope, ProjectionIndex } from "./index-schema.js";

export interface CopyInventory {
  readonly names: ReadonlySet<string>;
  readonly unread: readonly UninspectedCopies[];
}

/** A name omitted from the walk is absent only where the physical namespace was observed. */
export function copyAbsenceProved(inventory: CopyInventory, name: string): boolean {
  return !inventory.names.has(name) && uninspectedArchiveCopy(inventory.unread, name) === undefined;
}

/** A lost recovery name still leaves its logical destination owed. */
export function returnedDestinations(inventory: CopyInventory, prior: ReadonlySet<string>): string[] {
  return [...prior].flatMap(name => {
    const copy = copyAbsenceProved(inventory, name) ? parseAsideFile(name) : undefined;
    return copy?.role === "aside" ? [copy.path] : [];
  });
}

/** Recorded copies keep the authority of their entries during unindexed recovery. */
export function recordedCopyNames(index: ProjectionIndex): Set<string> {
  return new Set(Object.values(index.entries).flatMap(entry => entry.kind === "record" ? entry.copies.map(copy => copy.name) : []));
}

/** A new obstruction can conceal a prior unindexed scan without granting it authority over neighboring paths. */
export function pendingCopyScopes(inventory: CopyInventory, prior: readonly ArchiveCopyScope[], unindexed: boolean): ArchiveCopyScope[] {
  const pending = new Map<string, ArchiveCopyScope>();
  for (const { path } of inventory.unread) {
    const recovery = unindexed || prior.some(scope => scope.unindexed && coversArchivePath(scope.path, path));
    pending.set(path, recovery ? { path, unindexed: true } : { path });
    if (recovery) continue;
    for (const scope of prior) {
      if (scope.unindexed && coversArchivePath(path, scope.path)) pending.set(scope.path, scope);
    }
  }
  return [...pending.values()];
}

/** Recover newly observed names only where a no-index scan was explicitly deferred. */
export function recoveredScopeNames(index: ProjectionIndex, inventory: CopyInventory): string[] {
  const scopes = index.archiveCopyPending?.filter(scope => scope.unindexed) ?? [];
  if (scopes.length === 0) return [];
  const recorded = recordedCopyNames(index);
  return [...inventory.names].filter(name => {
    if (recorded.has(name) || index.withheldCopies.includes(name) || index.archiveRecoveryCopies?.includes(name)) return false;
    const copy = parseAsideFile(name);
    return copy?.role === "aside" && scopes.some(scope => coversArchivePath(scope.path, copy.path));
  });
}
