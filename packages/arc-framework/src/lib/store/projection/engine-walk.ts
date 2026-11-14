/** Discover projected files and symbolic links without following links or entering machine-local folders. */
import { lstatSync, readdirSync, type Dirent, type Stats } from "node:fs";
import { join } from "node:path";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { readProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";

/** One folder entry, typed by the read or by its own stat. */
export type WalkEntry = Pick<Dirent, "name" | "isDirectory" | "isFile" | "isSymbolicLink">;

/** Filesystem observations used by discovery, native unless a caller needs a fault or scheduling boundary. */
export interface ProjectionWalkFs {
  readonly readdir: (path: string) => readonly WalkEntry[];
  /** Names alone, read only where a typed read failed while its folder still exists. */
  readonly readdirNames?: (path: string) => readonly string[];
  readonly lstat?: (path: string) => Pick<Stats, "isDirectory" | "isFile" | "isSymbolicLink">;
}

/** Regular files eligible for inspection and links retained only for repair reporting. */
export interface ProjectionWalkResult {
  readonly files: readonly string[];
  readonly links: readonly string[];
}

const nativeWalkFs: ProjectionWalkFs = { readdir: path => readdirSync(path, { withFileTypes: true }) };

/** Enumerate typed folder entries without per-entry stats, yielding between folders for concurrent Git work. */
export async function walkProjectionRoots(checkout: string, roots: readonly string[],
  fs: ProjectionWalkFs = nativeWalkFs, linkFs?: ProjectionLinkFs): Promise<ProjectionWalkResult> {
  const selected = roots.filter(path => !isExcludedProjectionPath(path));
  const boundary = await readProjectionLinkBoundary(checkout, selected, linkFs);
  const pending = selected.filter(path => boundary(path) === null);
  const files: string[] = [];
  const links = [...new Set(selected.flatMap(path => {
    const link = boundary(path);
    return link === null ? [] : [link];
  }))];
  const output = { pending, files, links };
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (isExcludedProjectionPath(path)) continue;
    const entries = readProjectionFolder(join(checkout, path), fs);
    if (entries !== null) collectEntries(path, entries, output);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { files: files.sort(), links: links.sort() };
}

function collectEntries(path: string, entries: ReturnType<ProjectionWalkFs["readdir"]>,
  output: { pending: string[]; files: string[]; links: string[] }): void {
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (isExcludedProjectionPath(child)) continue;
    if (entry.isDirectory()) output.pending.push(child);
    else if (entry.isFile()) output.files.push(child);
    else if (entry.isSymbolicLink()) output.links.push(child);
  }
}

/**
 * Read one folder's typed entries, or null when the folder itself is gone. A typed read types each entry a filesystem
 * leaves untyped by its own stat, which fails when that one entry vanishes; the survivors are then typed one at a time,
 * so one vanished entry never drops the folder.
 */
export function readProjectionFolder(folder: string, fs: ProjectionWalkFs = nativeWalkFs): readonly WalkEntry[] | null {
  try {
    return fs.readdir(folder);
  } catch (error) {
    if (!missingPath(error)) throw error;
    return readSurvivingEntries(fs, folder);
  }
}

function readSurvivingEntries(fs: ProjectionWalkFs, folder: string): WalkEntry[] | null {
  const lstat = fs.lstat ?? (path => lstatSync(path)), names = fs.readdirNames ?? (path => readdirSync(path));
  let listed: readonly string[];
  try {
    if (!lstat(folder).isDirectory()) return null;
    listed = names(folder);
  } catch (error) {
    if (missingPath(error)) return null;
    throw error;
  }
  return listed.flatMap(name => {
    try {
      const stat = lstat(join(folder, name));
      return [{ name, isDirectory: () => stat.isDirectory(), isFile: () => stat.isFile(), isSymbolicLink: () => stat.isSymbolicLink() }];
    } catch (error) {
      if (missingPath(error)) return [];
      throw error;
    }
  });
}

function missingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
