/** Exact ownership evidence for compensation of a newly spawned operational checkout. */
import { stat, writeFile } from "node:fs/promises";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { createWorktreeMarkerGeneration, readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration,
  resolveWorktreeMarkerPath } from "../git/worktree-marker.js";

/** Code position observed immediately after Git creates the checkout, before provisioning. */
export interface SpawnedCheckoutCoordinate { head: string; branch: string | null }

/** Observe the exact commit and symbolic branch; an unreadable checkout grants no cleanup authority. */
export async function readSpawnedCheckoutCoordinate(exec: GitExec, path: string): Promise<SpawnedCheckoutCoordinate> {
  const head = (await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: path })).stdout.trim();
  if (head === "") throw new Error(`Cannot observe spawned checkout HEAD at ${path}`);
  let branch: string | null;
  try {
    branch = (await exec("git", ["symbolic-ref", "--quiet", "HEAD"], { cwd: path })).stdout.trim();
    if (branch === "") throw new Error(`Cannot observe spawned checkout branch at ${path}`);
  } catch (error) {
    if (error instanceof Error && "exitCode" in error && error.exitCode === 1) branch = null;
    else throw error;
  }
  return { head, branch };
}

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

/** Compensate only an unchanged spawn; let Git refuse dirty files and compare-delete any created branch. */
export async function removeDisposableSpawn(options: {
  exec: GitExec; path: string; markerGeneration?: Buffer; coordinate?: SpawnedCheckoutCoordinate; createdBranch?: string;
}): Promise<void> {
  const { exec, path, markerGeneration, coordinate } = options;
  if (markerGeneration === undefined || coordinate === undefined) {
    throw new Error(`Spawn rollback at ${path} lacks its initial claim or code position; preserve it for owner inspection.`);
  }
  await requireSpawnedWorktreeClaim(path, markerGeneration);
  await requireUnchangedCoordinate(exec, path, coordinate);
  const removed = await removeWorktreeMarkerGeneration(path, markerGeneration);
  if (removed.kind !== "removed") throw new Error(`Spawn rollback at ${path} lost its marker generation; preserve it for owner inspection.`);
  try {
    // Reobserve immediately before Git's own dirty-file check. External Git writers can still race this boundary.
    await requireUnchangedCoordinate(exec, path, coordinate);
    await exec("git", ["worktree", "remove", path]);
  } catch (error) {
    await restoreSpawnClaim(path, markerGeneration);
    throw new Error(`Spawn rollback at ${path} could not prove the checkout disposable; preserve it for owner inspection: ${String(error)}`, { cause: error });
  }
  if (options.createdBranch !== undefined) {
    const roster = await scanRegisteredWorktrees(exec);
    if (!roster.ok) throw new Error(roster.message);
    if (roster.worktrees.some((item) => item.branch === options.createdBranch)) {
      throw new Error(`Spawn rollback must preserve occupied branch ${options.createdBranch} for owner inspection.`);
    }
    await exec("git", ["update-ref", "-d", `refs/heads/${options.createdBranch}`, coordinate.head]);
  }
}

async function requireUnchangedCoordinate(exec: GitExec, path: string, expected?: SpawnedCheckoutCoordinate): Promise<void> {
  if (expected === undefined) throw new Error(`Spawn rollback at ${path} has no initial code position; preserve it for owner inspection.`);
  const actual = await readSpawnedCheckoutCoordinate(exec, path);
  if (actual.head !== expected.head || actual.branch !== expected.branch) {
    throw new Error(`Spawn rollback at ${path} observed changed HEAD or branch; preserve the checkout and its commits for owner inspection.`);
  }
}

async function restoreSpawnClaim(path: string, bytes: Buffer): Promise<void> {
  // Do not recreate a checkout removed by another operation, or overwrite a replacement marker.
  const present = await stat(path).then(() => true, (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  });
  if (!present) return;
  try { await writeFile(resolveWorktreeMarkerPath(path), bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")) throw error;
  }
}
