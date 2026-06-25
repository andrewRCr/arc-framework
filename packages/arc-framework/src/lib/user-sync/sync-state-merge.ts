/**
 * The per-machine union-merge for the sibling sync-state ref's tree.
 *
 * Each entry is keyed by `machineId` and a machine writes only its own key, so
 * concurrent cross-machine writes have no true conflict — they union. This
 * mirrors the errand per-slug tree-merge in shape, but the per-machine
 * *ownership* model replaces errand's same-key collision: the writing machine's
 * own key is authoritative from the local side (its latest write, or its
 * absence when the machine cleared the key), while every other machine's key is
 * taken from the remote — which `origin` holds authoritatively for the machine
 * that owns it. So no key clobbers another's, and a machine's own deletion
 * survives a remote that still carries the stale entry.
 *
 * @module
 */

/**
 * Union two per-machine entry trees from the writing machine's vantage point.
 *
 * Foreign keys come from `remote` (origin is authoritative for the machine that
 * owns each); the writer's own key comes from `local` — set when present (a
 * write or re-write), removed when absent (the writer cleared it). The result
 * preserves every sibling's entry, applies the writer's own latest state, and
 * never resurrects a key the writer deleted.
 *
 * @param local - This machine's local tree: `machineId` → blob-sha.
 * @param remote - The fetched remote tree: `machineId` → blob-sha.
 * @param ownMachineId - The writing machine's id — the one key `local` is authoritative for.
 * @returns The unioned `machineId` → blob-sha entries.
 */
export function mergeSyncStateEntries(
  local: Map<string, string>,
  remote: Map<string, string>,
  ownMachineId: string,
): Map<string, string> {
  const merged = new Map(remote);
  const own = local.get(ownMachineId);
  if (own === undefined) {
    merged.delete(ownMachineId);
  } else {
    merged.set(ownMachineId, own);
  }
  return merged;
}
