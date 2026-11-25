/** Bind a committed creation's owner without extending pre-commit rollback authority. */
import type { OwnerIdentity } from "../store/identity.js";
import { readWorktreeMarkerGeneration, replaceWorktreeMarkerGeneration } from "../git/worktree-marker.js";

/** Stamp only the creation's exact marker, returning an actionable failure after a committed batch. */
export async function stampCreatedWorkUnitMarker(options: {
  cwd: string; name: string; expected?: Buffer; owner?: OwnerIdentity;
}, replaceMarker: typeof replaceWorktreeMarkerGeneration = replaceWorktreeMarkerGeneration): Promise<string | null> {
  try {
    const { owner, expected } = options;
    if (owner?.type !== "work-item" || owner.uid === undefined || owner.name !== options.name || expected === undefined) {
      throw new Error("The committed creation's owner or marker receipt is incomplete.");
    }
    const current = await readWorktreeMarkerGeneration(options.cwd);
    if (current.kind !== "present" || !current.bytes.equals(expected)) throw new Error("The creation's marker generation changed.");
    const marker = current.marker;
    if (marker.provisioning !== undefined || marker.husk !== undefined || marker.createdFor?.kind !== "work-unit"
      || marker.createdFor.name !== options.name || marker.createdFor.uid !== undefined) {
      throw new Error("The creation's marker is no longer an unbound work-unit claim.");
    }
    const replaced = await replaceMarker(options.cwd, expected, { ...marker,
      createdFor: { kind: "work-unit", name: options.name, uid: owner.uid } });
    if (replaced.kind !== "replaced") throw new Error("The creation's marker generation changed before stamping.");
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Work unit ${options.name} remains live, but its checkout marker could not be bound. ${detail} Run arc materialize ${options.name} --here from ${options.cwd}.`;
  }
}
