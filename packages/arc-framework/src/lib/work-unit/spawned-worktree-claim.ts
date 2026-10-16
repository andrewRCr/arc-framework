/** Exact ownership evidence for compensation of a newly spawned operational checkout. */
import { createWorktreeMarkerGeneration, readWorktreeMarkerGeneration } from "../git/worktree-marker.js";

/** Establish a fresh claim before provisioning can fail or another operation can claim the checkout. */
export async function claimSpawnedWorktree(path: string, owner: {
  wuName: string; spawningIdentity: string; now?: number;
}): Promise<Buffer> {
  const result = await createWorktreeMarkerGeneration(path, {
    spawnedByArc: true, wuName: owner.wuName, createdFor: { kind: "work-unit", name: owner.wuName },
    spawningIdentity: owner.spawningIdentity, createdAt: new Date(owner.now ?? Date.now()).toISOString(),
  });
  if (result.kind !== "created") throw new Error(`Spawned checkout ${path} already has an ownership claim; preserve it for owner inspection.`);
  return result.bytes;
}

/** Refuse destructive compensation unless the spawn's exact claim is still present. */
export async function requireSpawnedWorktreeClaim(path: string, expected: Buffer | undefined): Promise<void> {
  const current = await readWorktreeMarkerGeneration(path);
  if (expected === undefined || current.kind !== "present" || !current.marker.spawnedByArc || !current.bytes.equals(expected)) {
    throw new Error(`Spawn rollback at ${path} lost its ownership marker generation; preserve the checkout and its work for owner inspection.`);
  }
}
