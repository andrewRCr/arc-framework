/** Observe materialization authority without sweeping unrelated files during a deleted-file restoration. */
import { checkIgnores } from "./ignore-check.js";
import { projectionFileReader, readReference } from "./change-detection.js";
import { readProjectionConfiguration } from "./configuration.js";
import { sweepAsideFolder, type SweepInput, type SweepResult } from "./sweep.js";
import type { ProjectionMaterializationInput } from "./materialization.js";
import { recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { walkProjectionRoots, type ProjectionWalkResult } from "./engine-walk.js";
import { archiveChangeRefusals, heldArchivePath, refuseArchiveChange, refuseUnreadArchiveScope, selectArchivePath,
  unreadArchiveScope } from "./archive-selection.js";
import type { FileStat, ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import type { StateVersion } from "../identity.js";
import { readProjectionInventory } from "./inventory.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { evidenceHeldProjectionMark, withheldProjectionMark } from "./materialization-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { ArchiveDestinationBlocked, archiveDirectoryDestination } from "./archive-file.js";
import { join } from "node:path";
import { createProjectionLinkBoundary } from "./discovery-links.js";
import { reportProjectionLinks } from "./report.js";

interface ArchiveDiscovery extends ProjectionWalkResult {
  readonly incomplete: ReadonlySet<string>;
  readonly owed: readonly string[];
}

interface ArchiveWalkOptions {
  readonly retry?: { readonly knownFile: (path: string) => boolean };
  readonly opaque?: ReadonlySet<string>;
}

/** Observe the filesystem part of a rebuild and keep unread archive folders opaque until retry. */
export async function observeMaterializationFiles({ root, index, recovered }: ProjectionMaterializationInput):
Promise<{ walked: ArchiveDiscovery; retry: ArchiveDiscovery | null }> {
  const retry = index === null && recovered !== undefined ? await observePendingArchiveDiscovery(root, recovered) : null;
  const walked = await observeArchiveScopes(root, [...PROJECTED_LIFECYCLE_ROOTS,
    ...projectedRootPaths(root.identity).filter(path => path.startsWith(".arc/user/"))], { opaque: retry?.incomplete });
  return { walked, retry };
}

/** Discover readable scopes while keeping permission refusals available to the caller's later phases. */
export async function observeArchiveScopes(root: ProjectionRootState, scopes: readonly string[],
  { retry, opaque }: ArchiveWalkOptions = {}): Promise<ArchiveDiscovery> {
  const incomplete = new Set<string>();
  const readable = scopes.filter(path => {
    if (selectArchivePath(root, path, { holdAccess: true }) === null) return true;
    if (retry !== undefined) incomplete.add(path);
    return false;
  });
  const archiveAccess = new Map<string, RefusedMark>(root.archiveDiscoveryHolds);
  const canEnumerate = retry !== undefined ? (path: string) => observeOwedDirectory(root, path, incomplete, archiveAccess)
    : opaque === undefined ? undefined : rebuildDirectoryCheck(root.checkout, opaque);
  const walked = await walkProjectionRoots(root.checkout, readable, root.ports.walkFs, root.ports.linkFs, archiveAccess,
    retry !== undefined, canEnumerate);
  if (retry !== undefined) retainOpaqueLinks(walked.links, scopes, retry.knownFile, incomplete);
  for (const [path, mark] of archiveAccess) {
    refuseUnreadArchiveScope(root, path, mark);
    incomplete.add(path);
  }
  return { ...walked, incomplete, owed: retry === undefined ? [] : scopes };
}

function rebuildDirectoryCheck(checkout: string, opaque: ReadonlySet<string>): (path: string) => boolean {
  const scopes = [...opaque];
  return path => !opaque.has(path) && (!scopes.some(scope => scope.startsWith(`${path}/`))
    || archiveDirectoryDestination(checkout, path) === null);
}

function observeOwedDirectory(root: ProjectionRootState, path: string, incomplete: Set<string>,
  access: Map<string, RefusedMark>): boolean {
  const refused = archiveDirectoryDestination(root.checkout, path);
  if (refused === null) return true;
  incomplete.add(path);
  if (refused.cause === "access") access.set(path, refused.mark);
  else refuseArchiveChange(root, path, refused.mark);
  return false;
}

function retainOpaqueLinks(links: readonly string[], scopes: readonly string[], knownFile: (path: string) => boolean,
  incomplete: Set<string>): void {
  for (const link of links) {
    // Keep any precise debt below an ancestor link. An interior link can hide descendants of an owed directory.
    const file = knownFile(link);
    const hidden = scopes.filter(path => path.startsWith(`${link}/`) || path === link && !file);
    if (file && hidden.length === 0) continue;
    for (const path of hidden.length === 0 ? [link] : hidden) incomplete.add(path);
  }
}

/** Establish the outstanding physical scopes' holds before the starting command sweeps their copies. */
export async function observePendingArchiveDiscovery(root: ProjectionRootState,
  index: Pick<ProjectionIndex, "archiveDiscoveryPending"> & Partial<Pick<ProjectionIndex, "entries">>,
): Promise<ArchiveDiscovery | null> {
  const scopes = index.archiveDiscoveryPending;
  if (scopes === undefined || scopes.length === 0) return null;
  const walked = await observeArchiveScopes(root, scopes, { retry: { knownFile: path => index.entries?.[path]?.kind === "record"
    || index.entries?.[path]?.stat?.type === "file" } });
  reportProjectionLinks(walked.links);
  if (walked.links.length > 0) {
    const previous = root.blockedByLink, retried = createProjectionLinkBoundary(walked.links);
    root.blockedByLink = path => previous(path) ?? retried(path);
  }
  return walked;
}

/** Complete an incomplete rebuild's inventory after the starting sweep has restored any returning files. */
export async function finishPendingArchiveDiscovery(root: ProjectionRootState, index: ProjectionIndex, walked: ArchiveDiscovery | null,
  restored: readonly string[], source: ProjectionSource, version: StateVersion): Promise<ProjectionIndex> {
  if (walked === null && restored.length === 0) return index;
  const files = new Set([...(walked?.files ?? []), ...restored]);
  const inventory = await readProjectionInventory(source, root.identity, version);
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  return recordRebuildDiscovery(root, index, { files, incomplete: walked?.incomplete, owed: [...walked?.owed ?? [], ...restored] }, desired.files,
    !desired.unresolved && inventory.diagnostics.length === 0);
}

/** Keep unindexed bytes withheld and retain any archive scope whose inspection still needs a retry. */
export async function recordRebuildDiscovery(root: ProjectionRootState, initial: ProjectionIndex,
  inventory: { files: Iterable<string>; incomplete: ReadonlySet<string> | undefined; owed: readonly string[] },
  desired: ReadonlyMap<string, unknown>, whole: boolean): Promise<ProjectionIndex> {
  let index = initial;
  const incomplete = new Set(inventory.incomplete);
  for (const path of inventory.files) {
    if (index.entries[path] !== undefined) continue;
    const owed = inventory.owed.some(scope => scope === path || path.startsWith(`${scope}/`));
    if (!owed && desired.has(path)) continue;
    const stat = await inspectDiscoveryFile(root, path, incomplete, owed);
    if (stat?.type !== "file" || desired.has(path)) continue;
    const refused = whole ? withheldProjectionMark(path, { checkout: root.checkout, known: false }) : evidenceHeldProjectionMark(path, root.checkout);
    index = withProjectionEntry(index, path, { kind: "ownerless", withheld: true, stat, refused });
    root.context.report?.({ path, copy: null, mark: refused });
  }
  const pending = [...incomplete].sort();
  return { ...index, archiveDiscoveryPending: pending.length > 0 ? pending : undefined };
}

async function inspectDiscoveryFile(root: ProjectionRootState, path: string, incomplete: Set<string>, owed: boolean): Promise<FileStat | null> {
  if (selectArchivePath(root, path, { report: owed, holdAccess: true }) !== null) {
    if (owed || unreadArchiveScope(root, path) !== null) incomplete.add(path);
    return null;
  }
  try { return await projectionFileReader(root.checkout, path).stat(join(root.checkout, path)); }
  catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    if (error.access || owed) {
      refuseArchiveChange(root, path, error.mark, null, error.access);
      incomplete.add(path);
    }
    return null;
  }
}

/** Full materialization sweeps; restoring deleted files only refreshes the ignore proof. */
export async function observeMaterialization(input: ProjectionMaterializationInput): Promise<SweepResult> {
  const { root } = input;
  const sweep: SweepInput = { location: root.location, checkout: root.checkout, index: input.index,
    withheldCopies: input.recovered?.withheldCopies, recoveryCopies: input.recovered?.archiveRecoveryCopies,
    format: root.context.format, takeIn: root.takeIn, writer: root.context.writer, refuseChange: archiveChangeRefusals(root),
    recoverArchiveSubmission: (index, path, entry) => recoverSubmittedArchiveEdit(root, index, path, entry),
    checkpoint: root.context.checkpoint, blockedByLink: root.blockedByLink, knownArchiveHold: path => heldArchivePath(root, path),
    ignoreRules: input.configuration.ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules,
    guard: { root: root.checkout, identity: root.identity, exec: root.ports.execInput, fs: root.ports.fs } };
  if (!input.onlyDeleted) return sweepAsideFolder(sweep);
  const ignores = await checkIgnores({ guard: sweep.guard, records: input.index.ignoreFiles,
    recordedGuard: input.index.ignoreGuard, reference: await readReference(root.checkout), format: sweep.format,
    ignoreRules: sweep.ignoreRules, readIgnoreRules: sweep.readIgnoreRules });
  return { ignores, index: input.index, swept: [], left: [], withheld: [], copies: [], restoredUnindexed: [] };
}
