/** Observe archive inventory under checkout authority, retaining the portion a later operation still owes. */
import { archiveDestination, archiveDirectoryDestination } from "./archive-file.js";
import { heldArchivePath, refuseArchiveChange, refuseUnreadArchiveScope, selectArchivePath, type ArchiveSelectionRoot } from "./archive-selection.js";
import { projectionLinkRemedy } from "./discovery-links.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import { walkProjectionRoots, type ProjectionWalkResult } from "./engine-walk.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";

/** The same physical authority for materialization, retry, and retirement observations. */
export type ArchiveDiscoveryRoot = ArchiveSelectionRoot & { readonly ports: Pick<ProjectionEnginePorts, "walkFs" | "linkFs"> };

/** Readable files and the unresolved scopes that prevent declaring this inventory complete. */
export interface ArchiveDiscovery extends ProjectionWalkResult {
  readonly incomplete: ReadonlyMap<string, RefusedMark>;
  readonly owed: readonly string[];
}

/** A validated header may carry obligations even when its entry partitions are unavailable. */
export type ArchiveDiscoveryBasis = Pick<ProjectionIndex, "archiveDiscoveryPending"> & Partial<Pick<ProjectionIndex, "entries">>;

interface ArchiveWalkOptions {
  readonly owed?: ArchiveDiscoveryBasis;
  readonly opaque?: ReadonlyMap<string, RefusedMark>;
}

/** Discover readable scopes, excluding foreign directories before they can contribute new retry work. */
export async function observeArchiveScopes(root: ArchiveDiscoveryRoot, scopes: readonly string[],
  { owed, opaque }: ArchiveWalkOptions = {}): Promise<ArchiveDiscovery> {
  const incomplete = new Map<string, RefusedMark>();
  const readable = scopes.filter(path => {
    const refused = owed === undefined ? selectArchivePath(root, path, { holdAccess: true }) : observeOwedArchivePath(root, path);
    if (refused === null) return true;
    if (owed !== undefined) incomplete.set(path, refused);
    return false;
  });
  const archiveAccess = new Map<string, RefusedMark>(root.archiveDiscoveryHolds);
  const mayEnumerate = (path: string) => opaque?.has(path) !== true && observeDirectory(root, path, archiveAccess,
    owed === undefined ? undefined : incomplete);
  const walked = await walkProjectionRoots(root.checkout, readable, root.ports.walkFs, root.ports.linkFs, archiveAccess,
    owed !== undefined, mayEnumerate);
  if (owed !== undefined) retainOpaqueLinks(walked.links, scopes, owed.entries, incomplete);
  for (const [path, mark] of archiveAccess) {
    refuseUnreadArchiveScope(root, path, mark);
    incomplete.set(path, mark);
  }
  return { ...walked, incomplete, owed: owed === undefined ? [] : scopes };
}

/** Recheck authority before discharging inventory, including when an earlier observation found the path readable. */
export function observeOwedArchivePath(root: ArchiveSelectionRoot, path: string): RefusedMark | null {
  const held = heldArchivePath(root, path);
  if (held !== null) return held;
  const refused = archiveDestination(root.checkout, path);
  if (refused === null) return null;
  refuseArchiveChange(root, path, refused.mark, null, refused.cause === "access");
  return refused.mark;
}

function observeDirectory(root: ArchiveDiscoveryRoot, path: string, access: Map<string, RefusedMark>,
  owed?: Map<string, RefusedMark>): boolean {
  const refused = archiveDirectoryDestination(root.checkout, path);
  if (refused === null) return true;
  if (refused.cause === "access") access.set(path, refused.mark);
  else if (owed !== undefined) {
    owed.set(path, refused.mark);
    refuseArchiveChange(root, path, refused.mark);
  }
  return false;
}

function retainOpaqueLinks(links: readonly string[], scopes: readonly string[], entries: ArchiveDiscoveryBasis["entries"],
  incomplete: Map<string, RefusedMark>): void {
  for (const link of links) {
    // A desired record can exist without physical evidence. Only a recorded regular file proves the leaf exception.
    const file = entries?.[link]?.stat?.type === "file";
    const hidden = scopes.filter(path => path.startsWith(`${link}/`) || path === link && !file);
    if (file && hidden.length === 0) continue;
    // Keep precise work below an ancestor link, or the opaque child itself inside a directory we owe.
    for (const path of hidden.length === 0 ? [link] : hidden) {
      incomplete.set(path, { reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(link) });
    }
  }
}

/** Observe owed archive scopes, including paths that may now be absent or a different physical kind. */
export async function observeOwedArchiveScopes(root: ArchiveDiscoveryRoot, index: ArchiveDiscoveryBasis): Promise<ArchiveDiscovery | null> {
  const scopes = index.archiveDiscoveryPending;
  return scopes === undefined || scopes.length === 0 ? null : observeArchiveScopes(root, scopes, { owed: index });
}

/** Find the retained refusal for an opaque scope that owns this path's inventory. */
export function opaqueArchiveScope(scopes: ArchiveDiscovery["incomplete"] | undefined, path: string): RefusedMark | null {
  for (const [scope, mark] of scopes ?? []) if (path === scope || path.startsWith(`${scope}/`)) return mark;
  return null;
}
