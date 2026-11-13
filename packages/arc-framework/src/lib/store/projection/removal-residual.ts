/** Observe unindexed personal files before destructive checkout retirement. */
import { lstat, readdir } from "node:fs/promises";
import type { Stats } from "node:fs";
import { join } from "node:path";
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../../git/worktree-marker.js";
import { isMachineLocalProjectionPath } from "./discovery-exclusions.js";

/** Filesystem observations that must preserve uncertainty without following symbolic links. */
export interface ProjectionResidualFs {
  readdir(path: string): Promise<string[]>;
  lstat(path: string): Promise<Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink">>;
}
const nativeFs: ProjectionResidualFs = { readdir, lstat };
type Check = Awaited<ReturnType<ProjectionRemovalSlots["check"]>>;

/** Check actual personal directories without resolving identity, admitting content, or touching a primary copy. */
export async function observeUnprojectedPersonalFiles(checkout: string, fs: ProjectionResidualFs = nativeFs): Promise<Check> {
  try {
    const marker = await readWorktreeMarker(checkout);
    if (marker.kind === "malformed") return { kind: "unobservable", detail: `${marker.path}: ${marker.message}` };
    if (marker.kind === "absent" || decodeWorktreeMarkerOwnership(marker.marker).kind !== "current") return { kind: "passes" };
    return await observeManagedPersonalFiles(checkout, fs);
  } catch (error) {
    return { kind: "unobservable", detail: `Cannot observe unindexed personal files at ${checkout}: ${error instanceof Error ? error.message : String(error)}. Repair the unreadable path, then retry.` };
  }
}

async function personalRootsAvailable(checkout: string, fs: ProjectionResidualFs): Promise<boolean> {
  for (const root of [".arc", ".arc/user"]) {
    const stat = await fs.lstat(join(checkout, root)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (stat === null || stat.isSymbolicLink()) return false;
    if (!stat.isDirectory()) throw new Error(`${root} is not a directory`);
  }
  return true;
}

async function observeManagedPersonalFiles(checkout: string, fs: ProjectionResidualFs): Promise<Check> {
  if (!await personalRootsAvailable(checkout, fs)) return { kind: "passes" };
  const files: string[] = [];
  for (const name of (await fs.readdir(join(checkout, ".arc/user"))).sort()) {
    const path = `.arc/user/${name}`;
    if (isMachineLocalProjectionPath(path)) continue;
    const stat = await fs.lstat(join(checkout, path));
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    await collectPersonalFiles(checkout, path, fs, files);
  }
  if (files.length === 0) return { kind: "passes" };
  const named = files.length === 1 ? `Unindexed personal file ${files[0]} remains` : `Unindexed personal files ${files.join(", ")} remain`;
  return { kind: "would-refuse", remedy: { text:
    `${named} in ${checkout}. Recover wanted bytes outside this checkout, remove the local residual, then retry.` } };
}

async function collectPersonalFiles(checkout: string, directory: string, fs: ProjectionResidualFs, files: string[]): Promise<void> {
  for (const name of (await fs.readdir(join(checkout, directory))).sort()) {
    const path = `${directory}/${name}`;
    if (isMachineLocalProjectionPath(path)) continue;
    const stat = await fs.lstat(join(checkout, path));
    if (stat.isSymbolicLink()) continue;
    if (stat.isFile()) files.push(path);
    else if (stat.isDirectory()) await collectPersonalFiles(checkout, path, fs, files);
  }
}
