/** Observe materialization authority without sweeping unrelated files during a deleted-file restoration. */
import { checkIgnores } from "./ignore-check.js";
import { projectionFileReader, readReference } from "./change-detection.js";
import { readProjectionConfiguration } from "./configuration.js";
import { sweepAsideFolder, type SweepInput, type SweepResult } from "./sweep.js";
import type { ProjectionMaterializationInput } from "./materialization.js";
import { recoverSubmittedArchiveEdit } from "./read-back-recovery.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import { observeArchiveScopes, observeOwedArchivePath, observeOwedArchiveScopes, type ArchiveDiscovery,
  type ArchiveDiscoveryBasis } from "./archive-discovery.js";
import { archiveChangeRefusals, heldArchivePath, refuseArchiveChange, selectArchivePath,
  unreadArchiveScope } from "./archive-selection.js";
import type { FileStat, ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import type { StateVersion } from "../identity.js";
import { readProjectionInventory } from "./inventory.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { evidenceHeldProjectionMark, withheldProjectionMark } from "./materialization-file.js";
import { withProjectionEntry } from "./index-memory.js";
import { ArchiveDestinationBlocked, isArchiveScope } from "./archive-file.js";
import { join } from "node:path";
import { createProjectionLinkBoundary } from "./discovery-links.js";
import { reportProjectionLinks } from "./report.js";

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
    owed: walked?.owed ?? [], returned: restored }, desired.files,
    !desired.unresolved && inventory.diagnostics.length === 0);
}

/** Keep unindexed bytes withheld and retain any archive scope whose inspection still needs a retry. */
export async function recordRebuildDiscovery(root: ProjectionRootState, initial: ProjectionIndex,
  inventory: { files: Iterable<string>; incomplete: Iterable<string> | undefined; owed: readonly string[]; returned: readonly string[] },
  desired: ReadonlyMap<string, unknown>, whole: boolean): Promise<ProjectionIndex> {
  // Losing an alias leaves its destination owed. Its physical kind still needs observation.
  const archive = inventory.returned.filter(isArchiveScope);
  const other = inventory.returned.filter(path => !isArchiveScope(path));
  const transferred = await observePendingArchiveDiscovery(root, { archiveDiscoveryPending: archive, entries: initial.entries });
  let index = initial;
  const incomplete = new Set([...inventory.incomplete ?? [], ...transferred?.incomplete.keys() ?? []]);
  const scopes = [...inventory.owed, ...archive];
  for (const path of new Set([...inventory.files, ...other, ...transferred?.files ?? []])) {
    if (index.entries[path] !== undefined) continue;
    const owed = scopes.some(scope => scope === path || path.startsWith(`${scope}/`));
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
  const refused = owed ? observeOwedArchivePath(root, path) : selectArchivePath(root, path, { report: false, holdAccess: true });
  if (refused !== null) {
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
