/** Keep discovered links outside physical edit retries while preserving accepted work and copy recovery. */
import type { Remedy } from "../refusal.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { commitProjectionIndex } from "./index-file.js";
import type { Stats } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { loadProjectionGroups, replaceLoadedProjectionEntries } from "./index-memory.js";

type IndexEntry = ProjectionIndex["entries"][string];
interface ProjectionLinkFs { readonly lstat: (path: string) => Promise<Pick<Stats, "isSymbolicLink">> }

/** The observed symbolic link that blocks a projected path, or no blocking link. */
export type ProjectionLinkBoundary = (path: string) => string | null;

/** Bind exact link paths and their descendants without consulting a link's target. */
export function createProjectionLinkBoundary(links: readonly string[]): ProjectionLinkBoundary {
  return path => links.find(link => path === link || path.startsWith(`${link}/`)) ?? null;
}

/** Re-observe destination ancestors before settlement, since an action may change them after command start. */
export async function readProjectionLinkBoundary(checkout: string, paths: readonly string[], fs: ProjectionLinkFs = { lstat }): Promise<ProjectionLinkBoundary> {
  const links: string[] = [];
  for (const path of new Set(paths)) {
    const link = await linkInPath(checkout, path, fs);
    if (link !== null) links.push(link);
  }
  return createProjectionLinkBoundary(links);
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
export async function reconcileProjectionLinks(root: Pick<ProjectionRootState, "checkout" | "location" | "context" | "blockedByLink" | "unsent">,
  index: ProjectionIndex): Promise<ProjectionIndex> {
  loadProjectionGroups(index, "walked");
  const entries = new Map(Object.entries(index.entries));
  let changed = false;
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind === "record" && entry.handoff !== undefined) continue;
    if (root.blockedByLink(path) === null) continue;
    const next = withoutPhysicalEdit(entry);
    if (next === null) entries.delete(path);
    else entries.set(path, next);
    if (next === null || next.kind === "record" && !next.pending) root.unsent.delete(path);
    changed ||= next !== entry;
  }
  return changed ? commitProjectionIndex({ checkout: root.checkout, location: root.location,
    checkpoint: root.context.checkpoint, index: replaceLoadedProjectionEntries(index, Object.fromEntries(entries)) }) : index;
}

function withoutPhysicalEdit(entry: IndexEntry): IndexEntry | null {
  if (entry.kind === "ownerless") return entry.minted === undefined ? null : entry;
  const recovery = entry.adoption?.kind === "read-back" || entry.copies.length > 0 || entry.inProgress !== null;
  if (entry.stat === null && (recovery || !entry.pending && entry.refused === null)) return entry;
  return { ...entry, stat: null, ...(recovery ? {} : { pending: false, refused: null }) };
}
