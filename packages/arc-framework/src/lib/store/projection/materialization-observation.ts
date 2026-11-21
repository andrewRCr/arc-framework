/** Observe materialization authority without sweeping unrelated files during a deleted-file restoration. */
import { checkIgnores } from "./ignore-check.js";
import { projectionFileReader, readReference } from "./change-detection.js";
import { readProjectionConfiguration } from "./configuration.js";
import { sweepAsideFolder, type SweepInput, type SweepResult } from "./sweep.js";
import type { ProjectionMaterializationInput } from "./materialization.js";
import { recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { walkProjectionRoots, type ProjectionWalkResult } from "./engine-walk.js";
import { heldArchivePath, refuseUnreadArchiveScope, selectArchivePath, unreadArchiveScope } from "./archive-selection.js";
import type { FileStat, ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import type { StateVersion } from "../identity.js";
import { readProjectionInventory } from "./inventory.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { evidenceHeldProjectionMark, withheldProjectionMark } from "./materialization-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { join } from "node:path";
import { createProjectionLinkBoundary } from "./discovery-links.js";
import { reportProjectionLinks } from "./report.js";

interface ArchiveDiscovery extends ProjectionWalkResult {
  readonly incomplete: ReadonlySet<string>;
}

/** Observe the filesystem part of a rebuild and keep unread archive folders opaque until retry. */
export async function observeMaterializationFiles(root: ProjectionRootState): Promise<ArchiveDiscovery> {
  return observeArchiveScopes(root, [...PROJECTED_LIFECYCLE_ROOTS,
    ...projectedRootPaths(root.identity).filter(path => path.startsWith(".arc/user/"))]);
}

/** Discover readable scopes while keeping permission refusals available to the caller's later phases. */
export async function observeArchiveScopes(root: ProjectionRootState, scopes: readonly string[], retry = false): Promise<ArchiveDiscovery> {
  const readable = scopes.filter(path => selectArchivePath(root, path, { holdAccess: true }) === null);
  const archiveAccess = new Map<string, RefusedMark>(root.archiveDiscoveryHolds);
  const walked = await walkProjectionRoots(root.checkout, readable, root.ports.walkFs, root.ports.linkFs, archiveAccess, retry);
  for (const [path, mark] of archiveAccess) refuseUnreadArchiveScope(root, path, mark);
  return { ...walked, incomplete: new Set(archiveAccess.keys()) };
}

/** Establish the outstanding physical scopes' holds before the starting command sweeps their copies. */
export async function observePendingArchiveDiscovery(root: ProjectionRootState, index: ProjectionIndex): Promise<ArchiveDiscovery | null> {
  const scopes = index.archiveDiscoveryPending;
  if (scopes === undefined || scopes.length === 0) return null;
  const walked = await observeArchiveScopes(root, scopes, true);
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
  return recordRebuildDiscovery(root, index, { files, incomplete: walked?.incomplete }, desired.files,
    !desired.unresolved && inventory.diagnostics.length === 0);
}

/** Keep unindexed bytes withheld and retain any archive scope whose inspection still needs a retry. */
export async function recordRebuildDiscovery(root: ProjectionRootState, initial: ProjectionIndex,
  inventory: { files: Iterable<string>; incomplete: ReadonlySet<string> | undefined },
  desired: ReadonlyMap<string, unknown>, whole: boolean): Promise<ProjectionIndex> {
  let index = initial;
  const incomplete = new Set(inventory.incomplete);
  for (const path of inventory.files) {
    if (index.entries[path] !== undefined || desired.has(path)) continue;
    const stat = await inspectDiscoveryFile(root, path, incomplete);
    if (stat?.type !== "file") continue;
    const refused = whole ? withheldProjectionMark(path, { checkout: root.checkout, known: false }) : evidenceHeldProjectionMark(path, root.checkout);
    index = withProjectionEntry(index, path, { kind: "ownerless", withheld: true, stat, refused });
    root.context.report?.({ path, copy: null, mark: refused });
  }
  const pending = [...incomplete].sort();
  return { ...index, archiveDiscoveryPending: pending.length > 0 ? pending : undefined };
}

async function inspectDiscoveryFile(root: ProjectionRootState, path: string, incomplete: Set<string>): Promise<FileStat | null> {
  if (selectArchivePath(root, path, { report: false, holdAccess: true }) !== null) {
    if (unreadArchiveScope(root, path) !== null) incomplete.add(path);
    return null;
  }
  try { return await projectionFileReader(root.checkout, path).stat(join(root.checkout, path)); }
  catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    refuseUnreadArchiveScope(root, path, error.mark);
    incomplete.add(path);
    return null;
  }
}

/** Full materialization sweeps; restoring deleted files only refreshes the ignore proof. */
export async function observeMaterialization(input: ProjectionMaterializationInput): Promise<SweepResult> {
  const { root } = input;
  const sweep: SweepInput = { location: root.location, checkout: root.checkout, index: input.index,
    withheldCopies: input.recovered?.withheldCopies, format: root.context.format, takeIn: root.takeIn, writer: root.context.writer,
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
