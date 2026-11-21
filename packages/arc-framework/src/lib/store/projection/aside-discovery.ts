/** Enumerate recovery names and completed scaffold visits without changing the aside tree. */
import { join } from "node:path";
import { lstatSync } from "node:fs";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";
import { readProjectionFolder, type ProjectionWalkFs, type WalkEntry } from "./engine-walk.js";
import { archiveOperationError, archivePermissionMark, isArchivePermissionRefusal } from "./archive-file.js";
import { readFile } from "node:fs/promises";
import { readStat } from "./change-detection.js";
import { isArchiveDiscoveryScope, type RefusedMark } from "./index-schema.js";
import { coversArchivePath } from "./archive-work.js";
import { projectionLinkRemedy, readProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";

/** Recovery names are opaque; directory events allow a writable consumer to prune on exit. */
export type ProjectionAsideVisit = { readonly kind: "copy" | "directory"; readonly location: string } | UninspectedCopies;

export interface UninspectedCopies {
  readonly kind: "uninspected";
  readonly location: string;
  readonly path: string;
  readonly mark: RefusedMark;
}

const archiveAsideRoot = `${ASIDE_FILES_ROOT}/completed`;

/** Map an unread physical namespace to the archive branch it mirrors. An unnamed child is still owed. */
function archiveCopyScope(location: string): string | undefined {
  if (coversArchivePath(location, archiveAsideRoot)) return ".arc/completed";
  if (!coversArchivePath(archiveAsideRoot, location)) return undefined;
  const scope = `.arc/${location.slice(ASIDE_FILES_ROOT.length + 1)}`;
  return isArchiveDiscoveryScope(scope) ? scope : undefined;
}

/** Find the reason an archive recovery name could not be observed. */
export function uninspectedArchiveCopy(holds: readonly UninspectedCopies[], location: string): UninspectedCopies | undefined {
  const copy = parseAsideFile(location);
  if (copy === undefined || !isArchiveDiscoveryScope(copy.path)) return undefined;
  return holds.find(hold => coversArchivePath(hold.location, location));
}

/** Walk typed entries without following directory links or entering an opaque recovery directory. */
export async function* walkProjectionAsideFolder(checkout: string, walkFs?: ProjectionWalkFs, linkFs?: ProjectionLinkFs):
AsyncGenerator<ProjectionAsideVisit> {
  const root = await inspectCopyRootAncestors(checkout, walkFs, linkFs);
  if (root !== true) {
    if (root !== false) yield root;
    return;
  }
  const pending = [{ directory: ASIDE_FILES_ROOT, visited: false }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { directory } = next;
    if (next.visited) { yield { kind: "directory", location: directory }; continue; }
    const scanned = scanCopyDirectory(checkout, directory, walkFs);
    yield* scanned.visits;
    if (!scanned.listed) continue;
    pending.push({ directory, visited: true }, ...scanned.folders.map(directory => ({ directory, visited: false })));
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

async function inspectCopyRootAncestors(checkout: string, walkFs?: ProjectionWalkFs, linkFs?: ProjectionLinkFs):
Promise<boolean | UninspectedCopies> {
  if (linkFs !== undefined) {
    const boundary = await readProjectionLinkBoundary(checkout, [ASIDE_FILES_ROOT], linkFs);
    const link = boundary(ASIDE_FILES_ROOT);
    if (link !== null) return linkedCopyDirectory(link) ?? false;
  }
  for (let end = ASIDE_FILES_ROOT.indexOf("/"); end >= 0; end = ASIDE_FILES_ROOT.indexOf("/", end + 1)) {
    const check = inspectCopyDirectory(checkout, ASIDE_FILES_ROOT.slice(0, end), walkFs);
    if (check !== true) return check;
  }
  return true;
}

function scanCopyDirectory(checkout: string, directory: string, walkFs?: ProjectionWalkFs): {
  visits: readonly ProjectionAsideVisit[]; folders: readonly string[]; listed: boolean;
} {
  const checked = inspectCopyDirectory(checkout, directory, walkFs);
  if (checked !== true) return { visits: checked === false ? [] : [checked], folders: [], listed: false };
  const { entries, unread } = asideDirectoryEntries(checkout, directory, walkFs);
  const visits: ProjectionAsideVisit[] = [...unread], folders: string[] = [];
  for (const entry of entries ?? []) {
    const location = `${directory}/${entry.name}`;
    const named = parseAsideFile(location);
    if (named?.role === "aside" || named !== undefined && !entry.isDirectory()) visits.push({ kind: "copy", location });
    else if (named === undefined && entry.isDirectory()) folders.push(location);
    else if (named === undefined && entry.isSymbolicLink()) {
      const hold = linkedCopyDirectory(location);
      if (hold !== undefined) visits.push(hold);
    }
  }
  return { visits, folders, listed: entries !== null };
}

/** One vanished entry never hides its siblings: the main walk's read keeps the surviving entries. */
function asideDirectoryEntries(checkout: string, directory: string, walkFs?: ProjectionWalkFs): {
  entries: readonly WalkEntry[] | null; unread: readonly UninspectedCopies[];
} {
  const unread: UninspectedCopies[] = [];
  // A named aside is listed even if typing it fails. Its consumer can bind the refusal to its destination.
  try {
    const entries = readProjectionFolder(join(checkout, directory), walkFs, undefined,
      (name, error) => { unread.push(deniedCopyDirectory(`${directory}/${name}`, error)); },
      name => parseAsideFile(`${directory}/${name}`)?.role === "aside");
    return { entries, unread };
  } catch (error) {
    return { entries: null, unread: [deniedCopyDirectory(directory, error)] };
  }
}

function inspectCopyDirectory(checkout: string, location: string, walkFs?: ProjectionWalkFs): boolean | UninspectedCopies {
  try {
    const stat = (walkFs?.lstat ?? lstatSync)(join(checkout, location));
    return stat.isSymbolicLink() ? linkedCopyDirectory(location) ?? false : stat.isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    return deniedCopyDirectory(location, error);
  }
}

function deniedCopyDirectory(location: string, error: unknown): UninspectedCopies {
  const path = archiveCopyScope(location);
  if (path === undefined || !isArchivePermissionRefusal(error)) throw error;
  const mark = archivePermissionMark(path, error, "inspect recovery copies for");
  return { kind: "uninspected", location, path, mark: { ...mark,
    remedy: { text: `Repair access to ${location} and retry the command.` } } };
}

function linkedCopyDirectory(location: string): UninspectedCopies | undefined {
  const path = archiveCopyScope(location);
  return path === undefined ? undefined : { kind: "uninspected", location, path,
    mark: { reason: `Recovery copies for ${path} cross a symbolic link.`, remedy: projectionLinkRemedy(location) } };
}

/** A leaf copy link is observable as itself. A link above the copy conceals its contents. */
export function archiveCopyLinkHold(path: string, name: string, link: string | null): RefusedMark | null {
  return link !== null && link !== name && isArchiveDiscoveryScope(path) ? linkedCopyDirectory(link)?.mark ?? null : null;
}

/** Type a named recovery copy at the point its logical destination is known. */
export async function readAsideStat(absolute: string, path: string): ReturnType<typeof readStat> {
  try { return await readStat(absolute); }
  catch (error) { throw archiveOperationError(path, error, "inspect a copy of"); }
}

/** Read a named recovery copy's contents for comparison under the same destination hold. */
export async function readAsideText(absolute: string, path: string): Promise<string> {
  try { return await readFile(absolute, "utf8"); }
  catch (error) { throw archiveOperationError(path, error, "read a copy of"); }
}
