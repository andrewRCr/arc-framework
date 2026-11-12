/** Pure three-way reconciliation of per-key identity blob object IDs. */

/** Result of reconciling local and remote identity objects from a common basis. */
export type IdentityObjectReconcile =
  | { kind: "merged"; objects: Map<string, string> }
  | { kind: "conflict"; keys: string[] };

/**
 * Three-way reconcile per-key identity blob changes.
 *
 * @param base - Common-history key to blob-OID state.
 * @param local - Tip-pinned local key to blob-OID state.
 * @param remote - Tip-pinned fetched-remote key to blob-OID state.
 * @returns The union of independent changes or every divergently changed key.
 */
export function reconcileIdentityObjects(
  base: ReadonlyMap<string, string>,
  local: ReadonlyMap<string, string>,
  remote: ReadonlyMap<string, string>,
): IdentityObjectReconcile {
  const keys = [...new Set([...base.keys(), ...local.keys(), ...remote.keys()])].sort();
  const objects = new Map<string, string>();
  const conflicts: string[] = [];
  for (const key of keys) {
    const baseOid = base.get(key);
    const localOid = local.get(key);
    const remoteOid = remote.get(key);
    let selected: string | undefined;
    if (localOid === remoteOid) selected = localOid;
    else if (localOid === baseOid) selected = remoteOid;
    else if (remoteOid === baseOid) selected = localOid;
    else {
      conflicts.push(key);
      continue;
    }
    if (selected !== undefined) objects.set(key, selected);
  }
  return conflicts.length > 0 ? { kind: "conflict", keys: conflicts } : { kind: "merged", objects };
}
