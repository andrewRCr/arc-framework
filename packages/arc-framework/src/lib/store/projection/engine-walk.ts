/** Discover projected files and symbolic links without following links or entering machine-local folders. */
import { lstatSync, readdirSync, type Dirent, type Stats } from "node:fs";
import { join } from "node:path";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { readProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";
import { archiveFileChangeMark, archivePermissionMark, isArchivePermissionRefusal, isArchiveScope } from "./archive-file.js";
import type { RefusedMark } from "./index-schema.js";

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

/** Enumerate typed folder entries, statting only those typed as links, yielding between folders for concurrent Git work. */
export async function walkProjectionRoots(checkout: string, roots: readonly string[],
  fs: ProjectionWalkFs = nativeWalkFs, linkFs?: ProjectionLinkFs, archiveAccess?: Map<string, RefusedMark>,
  rootsMayBeFiles = false, canEnumerate?: (folder: string) => boolean): Promise<ProjectionWalkResult> {
  const output = await selectWalkRoots(checkout, roots, linkFs, archiveAccess);
  const { pending, files, links } = output;
  const retype = rootsMayBeFiles ? new Set(pending) : undefined;
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (isExcludedProjectionPath(path) || archiveAccess?.has(path)) continue;
    if (retype?.delete(path) && !visitRetryScope(checkout, path, fs, archiveAccess, output)) continue;
    if (canEnumerate?.(path) === false) continue;
    const folder = readWalkFolder(checkout, path, fs, archiveAccess);
    if (folder?.kind === "listed") collectEntries(path, folder.entries, output);
    if (folder?.kind === "changed") recordChangedFolder(path, folder.stat, archiveAccess, output);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  return { files: files.sort(), links: links.sort() };
}

async function selectWalkRoots(checkout: string, roots: readonly string[], linkFs?: ProjectionLinkFs, archiveAccess?: Map<string, RefusedMark>) {
  const selected = roots.filter(path => !isExcludedProjectionPath(path) && !archiveAccess?.has(path));
  const boundary = await readProjectionLinkBoundary(checkout, selected, linkFs,
    archiveAccess === undefined ? undefined : (path, mark) => { archiveAccess.set(path, mark); });
  const pending = selected.filter(path => boundary(path) === null && !archiveAccess?.has(path));
  const links = [...new Set(selected.flatMap(path => {
    const link = boundary(path);
    return link === null ? [] : [link];
  }))];
  return { pending, files: [] as string[], links };
}

function visitRetryScope(checkout: string, path: string, fs: ProjectionWalkFs, archiveAccess: Map<string, RefusedMark> | undefined,
  output: { files: string[]; links: string[] }): boolean {
  try {
    const stat = walkLstat(fs)(join(checkout, path));
    if (stat.isDirectory()) return true;
    recordChangedFolder(path, stat, archiveAccess, output);
    return false;
  } catch (error) {
    if (missingPath(error)) return false;
    if (archiveAccess === undefined || !isArchiveScope(path)) throw error;
    archiveAccess.set(path, archivePermissionMark(path, error, "inspect"));
    return false;
  }
}

function recordChangedFolder(path: string, stat: FolderStat, archiveAccess: Map<string, RefusedMark> | undefined,
  output: { files: string[]; links: string[] }): void {
  if (archiveAccess === undefined || !isArchiveScope(path)) return;
  if (stat.isFile()) output.files.push(path);
  else if (stat.isSymbolicLink()) output.links.push(path);
  else archiveAccess.set(path, archiveFileChangeMark(path));
}

function readWalkFolder(checkout: string, path: string, fs: ProjectionWalkFs, archiveAccess?: Map<string, RefusedMark>) {
  const hold: ChildAccessHold | undefined = archiveAccess === undefined || !isArchiveScope(path) ? undefined : (name, error) => {
    const child = `${path}/${name}`;
    archiveAccess.set(child, archivePermissionMark(child, error, "inspect"));
  };
  try { return observeProjectionFolder(join(checkout, path), fs, name => isExcludedProjectionPath(`${path}/${name}`), hold); }
  catch (error) {
    if (archiveAccess === undefined || !isArchiveScope(path)) throw error;
    const mark = archivePermissionMark(path, error, "enumerate");
    archiveAccess.set(path, { ...mark, remedy: { text: "Repair access to the archive folder, then retry the command." } });
    return null;
  }
}

type ChildAccessHold = (name: string, error: unknown) => void;
type FolderStat = ReturnType<NonNullable<ProjectionWalkFs["lstat"]>>;
type FolderObservation = { readonly kind: "listed"; readonly entries: readonly WalkEntry[] }
  | { readonly kind: "absent" }
  | { readonly kind: "changed"; readonly stat: FolderStat };

function collectEntries(path: string, entries: ReturnType<ProjectionWalkFs["readdir"]>,
  output: { pending: string[]; files: string[]; links: string[] }): void {
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) output.pending.push(child);
    else if (entry.isFile()) output.files.push(child);
    else if (entry.isSymbolicLink()) output.links.push(child);
  }
}

/**
 * Observe whether a folder can be listed, is absent, or changed kind. A typed read types each entry a filesystem
 * leaves untyped by its own stat, which fails when that one entry vanishes; the survivors are then typed one at a time,
 * so one vanished entry never drops the folder. An entry the read types as a link is typed again by its own stat, since
 * a Windows listing types every reparse point as a link, a tagged regular file or folder included. A skipped name is left
 * out before any of that, so nothing about it is inspected.
 */
export function observeProjectionFolder(folder: string, fs: ProjectionWalkFs = nativeWalkFs,
  skip: (name: string) => boolean = () => false, hold?: ChildAccessHold,
  deferTyping?: (name: string) => boolean): FolderObservation {
  let entries: readonly WalkEntry[];
  try {
    entries = fs.readdir(folder).filter(entry => !skip(entry.name));
  } catch (error) {
    if (!missingPath(error) && !((hold !== undefined || deferTyping !== undefined) && isArchivePermissionRefusal(error))) throw error;
    return readSurvivingEntries(fs, folder, skip, hold, deferTyping);
  }
  if (!entries.some(entry => entry.isSymbolicLink())) return { kind: "listed", entries };
  const lstat = walkLstat(fs);
  return { kind: "listed", entries: entries.flatMap(entry => entry.isSymbolicLink() && deferTyping?.(entry.name) !== true
    ? statEntry(lstat, folder, entry.name, hold) : [entry]) };
}

function readSurvivingEntries(fs: ProjectionWalkFs, folder: string, skip: (name: string) => boolean, hold?: ChildAccessHold,
  deferTyping?: (name: string) => boolean): FolderObservation {
  const lstat = walkLstat(fs), names = fs.readdirNames ?? (path => readdirSync(path));
  const stat = readFolderStat(lstat, folder);
  if (stat === null) return { kind: "absent" };
  if (!stat.isDirectory()) return { kind: "changed", stat };
  try {
    return { kind: "listed", entries: names(folder).filter(name => !skip(name)).flatMap(name => deferTyping?.(name) === true
      ? [{ name, isDirectory: () => false, isFile: () => false, isSymbolicLink: () => false }]
      : statEntry(lstat, folder, name, hold)) };
  } catch (error) {
    if (!missingPath(error)) throw error;
    const current = readFolderStat(lstat, folder);
    return current === null ? { kind: "absent" } : { kind: "changed", stat: current };
  }
}

function readFolderStat(lstat: NonNullable<ProjectionWalkFs["lstat"]>, folder: string): FolderStat | null {
  try { return lstat(folder); }
  catch (error) {
    if (missingPath(error)) return null;
    throw error;
  }
}

function walkLstat(fs: ProjectionWalkFs): NonNullable<ProjectionWalkFs["lstat"]> {
  return fs.lstat ?? (path => lstatSync(path));
}

/** Type one entry by its own stat; an entry that vanished meanwhile is left out. */
function statEntry(lstat: NonNullable<ProjectionWalkFs["lstat"]>, folder: string, name: string, hold?: ChildAccessHold): WalkEntry[] {
  try {
    const stat = lstat(join(folder, name));
    return [{ name, isDirectory: () => stat.isDirectory(), isFile: () => stat.isFile(), isSymbolicLink: () => stat.isSymbolicLink() }];
  } catch (error) {
    if (missingPath(error)) return [];
    if (hold === undefined) throw error;
    hold(name, error);
    return [];
  }
}

function missingPath(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
