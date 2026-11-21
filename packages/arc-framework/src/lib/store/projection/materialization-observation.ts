/** Observe materialization authority without sweeping unrelated files during a deleted-file restoration. */
import { checkIgnores } from "./ignore-check.js";
import { projectionFileReader, readReference } from "./change-detection.js";
import { readProjectionConfiguration } from "./configuration.js";
import { sweepAsideFolder, type SweepInput, type SweepResult } from "./sweep.js";
import type { ProjectionMaterializationInput } from "./materialization.js";
import { recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { archiveScopesBehindLink, observeArchiveScopes, observeOwedArchivePath, observeOwedArchiveScopes, type ArchiveDiscovery,
  type ArchiveDiscoveryBasis } from "./archive-discovery.js";
import { archiveChangeRefusals, heldArchivePath, refuseArchiveChange, refuseUnreadArchiveScope, selectArchivePath,
  unreadArchiveScope } from "./archive-selection.js";
import type { FileStat, ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import type { StateVersion } from "../identity.js";
import { readProjectionInventory } from "./inventory.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { evidenceHeldProjectionMark, withheldProjectionMark } from "./materialization-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { ArchiveDestinationBlocked, archiveOperationError, isArchiveScope } from "./archive-file.js";
import { join } from "node:path";
import { lstatSync } from "node:fs";
import { createProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";
import { reportProjectionLinks } from "./report.js";
import { coversArchivePath } from "./archive-work.js";

/** Observe the filesystem part of a rebuild and keep unread archive folders opaque until retry. */
export async function observeMaterializationFiles({ root, index, recovered }: ProjectionMaterializationInput):
Promise<{ walked: ArchiveDiscovery; retry: ArchiveDiscovery | null }> {
  const retry = index === null && recovered !== undefined ? await observePendingArchiveDiscovery(root, recovered) : null;
  const walked = await observeArchiveScopes(root, [...PROJECTED_LIFECYCLE_ROOTS,
    ...projectedRootPaths(root.identity).filter(path => path.startsWith(".arc/user/"))], { opaque: retry?.incomplete });
  return { walked, retry };
}

/** Establish the outstanding physical scopes' holds before the starting command sweeps their copies. */
export async function observePendingArchiveDiscovery(root: ProjectionRootState, index: ArchiveDiscoveryBasis): Promise<ArchiveDiscovery | null> {
  const walked = await observeOwedArchiveScopes(root, index);
  if (walked === null) return null;
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
  const inventory = await readProjectionInventory(source, root.identity, version);
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  return recordRebuildDiscovery(root, index, { files: walked?.files ?? [], incomplete: walked?.incomplete.keys(),
    directories: walked?.directories ?? [], owed: walked?.owed ?? [], returned: restored }, desired.files,
    !desired.unresolved && inventory.diagnostics.length === 0);
}

interface RebuildObservations {
  readonly files: Iterable<string>;
  readonly incomplete?: Iterable<string>;
  readonly directories: Iterable<string>;
  readonly owed: readonly string[];
  readonly returned: readonly string[];
}

/** Keep unindexed bytes withheld and retain any archive scope whose inspection still needs a retry. */
export async function recordRebuildDiscovery(root: ProjectionRootState, initial: ProjectionIndex, inventory: RebuildObservations,
  desired: ReadonlyMap<string, unknown>, whole: boolean): Promise<ProjectionIndex> {
  // Losing an alias leaves its destination owed. Its physical kind still needs observation.
  const archive = inventory.returned.filter(isArchiveScope);
  const other = inventory.returned.filter(path => !isArchiveScope(path));
  const transferred = await observePendingArchiveDiscovery(root, { ...initial, archiveDiscoveryPending: archive });
  let index = initial;
  const observedScopes = new Set(inventory.owed);
  const incomplete = new Set([...initial.archiveDiscoveryPending?.filter(path => !observedScopes.has(path)) ?? [],
    ...inventory.incomplete ?? [], ...transferred?.incomplete.keys() ?? []]);
  const directories = new Set([...inventory.directories, ...transferred?.directories ?? [], ...initial.archiveDiscoveryDirectories ?? []]);
  const scopes = [...inventory.owed, ...archive];
  for (const path of new Set([...inventory.files, ...other, ...transferred?.files ?? []])) {
    const owed = scopes.some(scope => coversArchivePath(scope, path));
    if (!owed && (desired.has(path) || index.entries[path] !== undefined)) continue;
    const stat = await inspectDiscoveryFile(root, path, { index, scopes, owed, incomplete, directories });
    if (stat?.type !== "file" || desired.has(path) || index.entries[path] !== undefined) continue;
    const refused = whole ? withheldProjectionMark(path, { checkout: root.checkout, known: false }) : evidenceHeldProjectionMark(path, root.checkout);
    index = withProjectionEntry(index, path, { kind: "ownerless", withheld: true, stat, refused });
    root.context.report?.({ path, copy: null, mark: refused });
  }
  const pending = [...incomplete].sort();
  const pendingDirectories = pending.filter(path => directories.has(path));
  return { ...index, archiveDiscoveryPending: pending.length > 0 ? pending : undefined,
    archiveDiscoveryDirectories: pendingDirectories.length > 0 ? pendingDirectories : undefined };
}

interface FinalDiscovery {
  readonly index: ProjectionIndex;
  readonly scopes: readonly string[];
  readonly owed: boolean;
  readonly incomplete: Set<string>;
  readonly directories: Set<string>;
}

async function inspectDiscoveryFile(root: ProjectionRootState, path: string, observation: FinalDiscovery): Promise<FileStat | null> {
  const { incomplete, owed } = observation;
  const refused = owed ? observeOwedArchivePath(root, path) : selectArchivePath(root, path, { report: false, holdAccess: true });
  if (refused !== null) {
    if (owed || unreadArchiveScope(root, path) !== null) incomplete.add(path);
    return null;
  }
  try {
    const absolute = join(root.checkout, path);
    const stat = await projectionFileReader(root.checkout, path).stat(absolute);
    if (isArchiveScope(path)) retainChangedScope(root, path, absolute, stat, observation);
    return stat;
  }
  catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    if (error.access || owed) {
      refuseArchiveChange(root, path, error.mark, null, error.access);
      incomplete.add(path);
    }
    return null;
  }
}

function retainChangedScope(root: ProjectionRootState, path: string, absolute: string, stat: FileStat | null, observed: FinalDiscovery): void {
  if (stat?.type === "symlink") {
    const basis = { ...observed.index, archiveDiscoveryDirectories: [...observed.directories] };
    for (const scope of archiveScopesBehindLink(path, observed.scopes, basis)) {
      observed.incomplete.add(scope);
      refuseUnreadArchiveScope(root, scope, { reason: `${scope} crosses a symbolic link.`, remedy: projectionLinkRemedy(path) });
    }
  } else if (stat?.type === "other" && isNowDirectory(path, absolute)) {
    observed.directories.add(path);
    observed.incomplete.add(path);
    refuseUnreadArchiveScope(root, path, { reason: `${path} became a directory during discovery.`,
      remedy: { text: "Retry the command to finish inspecting the archive directory." } });
  }
}

function isNowDirectory(path: string, absolute: string): boolean {
  try { return lstatSync(absolute, { throwIfNoEntry: false })?.isDirectory() === true; }
  catch (error) { throw archiveOperationError(path, error, "inspect"); }
}

/** Full materialization sweeps; restoring deleted files only refreshes the ignore proof. */
export async function observeMaterialization(input: ProjectionMaterializationInput): Promise<SweepResult> {
  const { root } = input;
  const sweep: SweepInput = { location: root.location, checkout: root.checkout, index: input.index,
    withheldCopies: input.recovered?.withheldCopies, recoveryCopies: input.recovered?.archiveRecoveryCopies,
    recoveryScopes: input.recovered?.archiveCopyPending,
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
