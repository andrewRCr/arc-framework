/** Observe archive inventory under checkout authority, retaining the portion a later operation still owes. */
import { archiveDestination, archiveDirectoryDestination, isArchiveScope } from "./archive-file.js";
import { parseAsideFile } from "./aside.js";
import { heldArchivePath, refuseArchiveChange, refuseUnreadArchiveScope, selectArchivePath, type ArchiveSelectionRoot } from "./archive-selection.js";
import { projectionLinkRemedy } from "./discovery-links.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import { walkProjectionRoots, type ProjectionWalkResult } from "./engine-walk.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import { coversArchivePath } from "./archive-work.js";

/** The same physical authority for materialization, retry, and retirement observations. */
export type ArchiveDiscoveryRoot = ArchiveSelectionRoot & { readonly ports: Pick<ProjectionEnginePorts, "walkFs" | "linkFs"> };

/** Readable files and the unresolved scopes that prevent declaring this inventory complete. */
export interface ArchiveDiscovery extends ProjectionWalkResult {
  readonly incomplete: ReadonlyMap<string, RefusedMark>;
  readonly owed: readonly string[];
  readonly directories: ReadonlySet<string>;
}

/** A validated header may carry obligations even when its entry partitions are unavailable. */
export type ArchiveDiscoveryBasis = Pick<ProjectionIndex, "archiveDiscoveryPending" | "archiveDiscoveryDirectories">
  & Partial<Pick<ProjectionIndex, "entries">>;

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
  const directories = new Set(owed?.archiveDiscoveryDirectories);
  const mayEnumerate = (path: string) => {
    if (isArchiveScope(path)) directories.add(path);
    return opaque?.has(path) !== true && observeDirectory(root, path, archiveAccess, owed === undefined ? undefined : incomplete);
  };
  const walked = await walkProjectionRoots(root.checkout, readable, root.ports.walkFs, root.ports.linkFs, archiveAccess,
    owed !== undefined, mayEnumerate);
  if (owed !== undefined) retainOpaqueLinks(walked.links, scopes, owed, incomplete);
  for (const [path, mark] of archiveAccess) {
    refuseUnreadArchiveScope(root, path, mark);
    incomplete.set(path, mark);
  }
  return { ...walked, incomplete, directories, owed: owed === undefined ? [] : scopes };
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

function retainOpaqueLinks(links: readonly string[], scopes: readonly string[], basis: ArchiveDiscoveryBasis,
  incomplete: Map<string, RefusedMark>): void {
  for (const link of links) {
    for (const path of archiveScopesBehindLink(link, scopes, basis)) {
      incomplete.set(path, { reason: `${path} crosses a symbolic link.`, remedy: projectionLinkRemedy(link) });
    }
  }
}

/** Compute the unread portion of existing obligations at a link without following it. */
export function archiveScopesBehindLink(link: string, scopes: readonly string[], basis: ArchiveDiscoveryBasis): readonly string[] {
  // A recorded file may prove the leaf's type. It cannot establish coverage of any owed descendant.
  const file = basis.entries?.[link]?.stat?.type === "file" && !basis.archiveDiscoveryDirectories?.includes(link);
  const descendants = scopes.filter(path => path !== link && coversArchivePath(link, path));
  const owesLink = scopes.some(scope => coversArchivePath(scope, link));
  // A narrower retry does not account for the unnamed children in the broader branch.
  return owesLink && (!file || descendants.length > 0) ? [link, ...descendants] : descendants;
}

/** The destinations still owed by named archive recovery copies. */
export function archiveRecoveryDestinations(copies?: readonly string[]): readonly string[] {
  return copies?.flatMap(copy => {
    const named = parseAsideFile(copy);
    return named?.role === "aside" && isArchiveScope(named.path) ? [named.path] : [];
  }) ?? [];
}

/** A leaf link can be replaced only if it conceals no outstanding archive inventory. */
export function archiveInventoryLinkHold(index: ProjectionIndex, link: string): RefusedMark | null {
  if (!isArchiveScope(link)) return null;
  const scopes = [...index.archiveDiscoveryPending ?? [], ...archiveRecoveryDestinations(index.archiveRecoveryCopies)];
  const held = index.archiveCopyPending?.some(scope => coversArchivePath(scope.path, link) || coversArchivePath(link, scope.path));
  return !held && archiveScopesBehindLink(link, scopes, index).length === 0 ? null
    : { reason: `${link} can conceal outstanding archive inventory.`, remedy: projectionLinkRemedy(link) };
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
