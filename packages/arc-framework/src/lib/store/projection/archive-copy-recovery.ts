/** Separate copy namespace coverage from the disposition and recovery authority of each name. */
import { parseAsideFile } from "./aside.js";
import { coversArchivePath } from "./archive-work.js";
import { concealsArchiveCopies, type UninspectedCopies } from "./aside-discovery.js";
import { isArchiveDiscoveryScope, type ArchiveCopyScope, type ProjectionIndex } from "./index-schema.js";

export interface CopyInventory {
  readonly names: ReadonlySet<string>;
  readonly unread: readonly UninspectedCopies[];
}

/** Look up a physical coverage gap regardless of the recovery name's logical destination. */
export function uninspectedCopy(holds: readonly UninspectedCopies[], name: string): UninspectedCopies | undefined {
  return holds.find(hold => coversArchivePath(hold.location, name));
}

/** A name omitted from the walk is absent only where the physical namespace was observed. */
export function copyAbsenceProved(inventory: CopyInventory, name: string): boolean {
  return !inventory.names.has(name) && uninspectedCopy(inventory.unread, name) === undefined;
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

/** Attribute an incomplete copy scan using archive-specific locations or independently known archive work. */
export function uninspectedCopyScopes(hold: UninspectedCopies, prior: readonly ArchiveCopyScope[], known: Iterable<string>,
  unindexed: boolean): readonly string[] {
  if (hold.archivePath !== undefined) return [hold.archivePath];
  if (!concealsArchiveCopies(hold)) return [];
  if (unindexed || hold.cause !== "link") return [".arc/completed"];
  const paths = new Set(prior.map(scope => scope.path));
  for (const name of known) {
    if (!coversArchivePath(hold.location, name)) continue;
    const copy = parseAsideFile(name);
    if (copy?.role === "aside" && isArchiveDiscoveryScope(copy.path)) paths.add(copy.path);
  }
  return [...paths];
}

/** A new obstruction can conceal a prior unindexed scan without granting it authority over neighboring paths. */
export function pendingCopyScopes(scopes: readonly string[], prior: readonly ArchiveCopyScope[], unindexed: boolean): ArchiveCopyScope[] {
  const pending = new Map<string, ArchiveCopyScope>();
  for (const path of scopes) {
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
