/** Keep discovered links outside physical edit retries while preserving accepted work and copy recovery. */
import type { Remedy } from "../refusal.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { commitProjectionIndex } from "./index-file.js";
import type { Stats } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { loadedProjectionGroups, loadProjectionGroups, replaceLoadedProjectionEntries } from "./index-memory.js";
import { heldArchivePath, refuseUnreadArchiveScope, selectArchivePath, type ArchiveSelectionRoot } from "./archive-selection.js";
import { archivePermissionMark, isArchiveScope } from "./archive-file.js";

type IndexEntry = ProjectionIndex["entries"][string];
/** Asynchronous ancestor observations, independent of synchronous folder enumeration. */
export interface ProjectionLinkFs { readonly lstat: (path: string) => Promise<Pick<Stats, "isSymbolicLink">> }

/** The observed symbolic link that blocks a projected path, or no blocking link. */
export type ProjectionLinkBoundary = (path: string) => string | null;

/** Bind exact link paths and their descendants without consulting a link's target. */
export function createProjectionLinkBoundary(links: readonly string[]): ProjectionLinkBoundary {
  return path => links.find(link => path === link || path.startsWith(`${link}/`)) ?? null;
}

/** Re-observe destination ancestors before settlement, since an action may change them after command start. */
export async function readProjectionLinkBoundary(checkout: string, paths: readonly string[], fs: ProjectionLinkFs = { lstat },
  holdArchiveAccess?: (path: string, mark: RefusedMark) => void): Promise<ProjectionLinkBoundary> {
  const links: string[] = [];
  for (const path of new Set(paths)) {
    const link = await linkInPath(checkout, path, fs).catch((error: unknown) => {
      if (holdArchiveAccess === undefined || !isArchiveScope(path)) throw error;
      holdArchiveAccess(path, archivePermissionMark(path, error, "inspect folders for"));
      return null;
    });
    if (link !== null) links.push(link);
  }
  return createProjectionLinkBoundary(links);
}

/** Probe only accessible destinations and retain native archive refusals for the caller's later work. */
export function readWritableArchiveLinkBoundary(root: ArchiveSelectionRoot, paths: readonly string[], fs?: ProjectionLinkFs): Promise<ProjectionLinkBoundary> {
  return readProjectionLinkBoundary(root.checkout, paths.filter(path => heldArchivePath(root, path) === null), fs,
    (path, mark) => { refuseUnreadArchiveScope(root, path, mark); });
}

/** Record an inaccessible archive destination without losing the link verdicts for other work. */
export async function readCopyDestinations(checkout: string, paths: readonly string[], fs?: ProjectionLinkFs,
  knownHold?: (path: string) => RefusedMark | null): Promise<{
  blockedByLink: ProjectionLinkBoundary; archiveAccess: Map<string, RefusedMark>;
}> {
  const archiveAccess = new Map<string, RefusedMark>();
  const readable = knownHold === undefined ? paths : paths.filter(path => {
    const mark = knownHold(path);
    if (mark === null) return true;
    archiveAccess.set(path, mark);
    return false;
  });
  const blockedByLink = await readProjectionLinkBoundary(checkout, readable, fs, (path, mark) => { archiveAccess.set(path, mark); });
  return { blockedByLink, archiveAccess };
}

async function linkInPath(checkout: string, path: string, fs: ProjectionLinkFs): Promise<string | null> {
  const parts = path.split("/");
  for (let length = 1; length <= parts.length; length += 1) {
    const prefix = parts.slice(0, length).join("/");
    try {
      if ((await fs.lstat(join(checkout, prefix))).isSymbolicLink()) return prefix;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw error;
    }
  }
  return null;
}

/** Name the ordinary filesystem object needed in place of a discovered link. */
export function projectionLinkRemedy(link: string): Remedy {
  return { text: `Replace the symbolic link ${link} with the regular file or directory that belongs at that path, then retry; its target is never followed or read.` };
}

/** Remove obsolete ownerless blockers and physical-file refusals, retaining exact records and recovery obligations. */
export async function reconcileProjectionLinks(root: Pick<ProjectionRootState, "checkout" | "location" | "context" | "blockedByLink" | "unsent"
  | "archiveSelection">,
  index: ProjectionIndex): Promise<ProjectionIndex> {
  loadProjectionGroups(index, "walked");
  const groups = loadedProjectionGroups(index);
  const entries = new Map(Object.entries(index.entries));
  let changed = false;
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind === "record" && entry.handoff !== undefined) continue;
    if (root.blockedByLink(path) === null) continue;
    // An archive path this checkout does not own keeps its entry, with any opening, recording, and copies.
    if (selectArchivePath(root, path) !== null) continue;
    const next = withoutPhysicalEdit(entry);
    if (next === null) entries.delete(path);
    else entries.set(path, next);
    if (next === null || next.kind === "record" && !next.pending) root.unsent.delete(path);
    changed ||= next !== entry;
  }
  return changed ? commitProjectionIndex({ checkout: root.checkout, location: root.location,
    checkpoint: root.context.checkpoint, index: replaceLoadedProjectionEntries(index, Object.fromEntries(entries), groups) }) : index;
}

function withoutPhysicalEdit(entry: IndexEntry): IndexEntry | null {
  if (entry.archiveSubmission !== undefined) return entry;
  if (entry.kind === "ownerless") return entry.minted === undefined ? null : entry;
  const recovery = entry.adoption?.kind === "read-back" || entry.persisted?.recording === true || entry.copies.length > 0 || entry.inProgress !== null;
  if (entry.stat === null && (recovery || !entry.pending && entry.refused === null)) return entry;
  return { ...entry, stat: null, ...(recovery ? {} : { pending: false, refused: null }) };
}
