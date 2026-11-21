/** Materialize stored records under one target worktree's projection lease. */
import { observeMaterialization, observeMaterializationFiles, recordRebuildDiscovery } from "./materialization-observation.js";
import { recordProjectionSweep } from "./end-work.js";
import { projectionTimingNow, recordProjectionTiming, reportProjectionTripwires } from "./timings.js";
import { prepareMaterializationSelection, refreshMaterializationLinks } from "./materialization-selection.js";
import { projectionSettings } from "./settings.js";
import { ensureGitExcludePatterns } from "../../git/exclude.js";
import { nodeWorktreeMarkerIgnoreFs } from "../../git/worktree-marker.js";
import { readProjectionInventory } from "./inventory.js";
import { retainUncertainProjectionPaths } from "./placement-evidence.js";
import { desiredProjectionPaths } from "./desired-paths.js";
import { createProjectionProtection } from "./protection.js";
import { createProjectionProtectionEvidence } from "./protection-evidence.js";
import { createRecordRenderer } from "./record-render.js";
import { prepareMaterializationFile } from "./materialization-file.js";
import { createProjectionLinkBoundary } from "./discovery-links.js";
import { reportLeftCopies, reportProjectionLinks } from "./report.js";
import { readReference } from "./change-detection.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { commitProjectionIndex } from "./index-file.js";
import { projectionExcludePatterns } from "./excludes.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { laidProjectionPaths } from "./discovery-exclusions.js";
import { recordProjectionIgnoreCheck } from "./ignore-record.js";
import { recordUnindexedRecovery, writableUnder, type SweepResult } from "./sweep.js";
import { createHistoryMemo } from "./base-recovery.js";
import { findProjectionArrivals, projectionArrivalsInstalled } from "./ownership-handoff.js";
import { removeObsoleteProjectionPaths } from "./refresh-removals.js";
import { sameReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionSource } from "./record-source.js";
import type { ProjectionConfiguration } from "./configuration.js";
import { PROJECTION_INDEX_FORMAT, type ProjectionIndex, type RefusedMark } from "./index-schema.js";
import type { StateVersion } from "../identity.js";
import { ensureProjectionScratch } from "./scratch-folder.js";
import { reportArchivedProjectionFile, reportRemainingArchivedFiles } from "./archive-report.js";
import { archiveChangeRefusals } from "./archive-selection.js";

/** Inputs observed by the lease-owning caller. */
interface ProjectionMaterializationBasis {
  readonly root: ProjectionRootState;
  readonly source: ProjectionSource;
  readonly configuration: ProjectionConfiguration;
  readonly version: StateVersion;
  readonly startTiming?: number;
  readonly recovered?: Pick<ProjectionIndex, "withheldCopies" | "archiveRecoveryCopies">;
  /** Links this command's start already reported, which the lay leaves unreported so each is reported once. */
  readonly reportedLinks?: readonly string[];
}
/**
 * A full lay over no usable index, or the restoration of deleted files over a usable one. A usable index never takes a
 * full lay: only complete removal evidence could advance its state, and the start's refresh owns that.
 */
export type ProjectionMaterializationInput = ProjectionMaterializationBasis
  & ({ readonly index: null; readonly onlyDeleted?: false; readonly settleBeforeSweep?: () => Promise<void> }
    | { readonly index: ProjectionIndex; readonly onlyDeleted: true; readonly settleBeforeSweep?: never });
/** The resulting index, retaining any per-root refusal for callers that report a failed materialization. */
export type ProjectionMaterializationResult = { readonly kind: "materialized"; readonly index: ProjectionIndex }
  | { readonly kind: "refused"; readonly index: ProjectionIndex; readonly mark: RefusedMark };

/** Lay the complete visible inventory while preserving every file without a trustworthy basis. */
export async function materializeProjectionRoot(input: ProjectionMaterializationInput): Promise<ProjectionMaterializationResult> {
  const { root } = input;
  // A restoration takes nothing in: an edit it meets at an archived path waits for an opening.
  const admitsForcedEdit = input.onlyDeleted !== true;
  const startedAt = projectionTimingNow(root.ports);
  await root.context.checkpoint?.();
  const excluded = await ensureGitExcludePatterns(root.checkout, projectionExcludePatterns(), root.ports.exec, nodeWorktreeMarkerIgnoreFs);
  if (!excluded.ok) throw excluded.error;
  let index: ProjectionIndex = input.index ?? { format: PROJECTION_INDEX_FORMAT, state: null, entries: {}, withheldCopies: [], tripwires: {},
    ignoreFiles: null, ignoreGuard: null, projectedUnder: projectionSettings(root) };
  const walked = await observeMaterializationFiles(root);
  await input.settleBeforeSweep?.();
  const swept = await observeMaterialization(input);
  const ignores = swept.ignores;
  index = recordProjectionIgnoreCheck(swept.index ?? { ...index,
    // Only the copies the sweep still found stay withheld; a deleted copy's name is released.
    withheldCopies: [...swept.withheld] }, ignores);
  if (input.index === null) {
    index = recordUnindexedRecovery(index, swept.left, new Set(input.recovered?.archiveRecoveryCopies));
  }
  root.writable = writableUnder(ignores, guardedProjectionRoots(root.identity).map(each => each.path));
  recordSweep(root, swept, !input.onlyDeleted);
  if (ignores.kind === "refused") return { kind: "refused", index, mark: { reason: `Projection ignore guard refused: ${ignores.reason}`,
    remedy: { text: ignores.remedy } } };
  const inventory = await readProjectionInventory(input.source, root.identity, input.version);
  for (const mark of inventory.diagnostics) root.context.report?.({ path: root.checkout, copy: null, mark });
  const desired = await desiredProjectionPaths(root, inventory);
  const whole = !desired.unresolved && inventory.diagnostics.length === 0;
  const evidence = createProjectionProtectionEvidence({ source: inventory.source, checkout: root.checkout, exec: root.ports.exec });
  const renderer = createRecordRenderer({ store: inventory.source, memo: root.context.memo ?? createHistoryMemo(root.store), protection: createProjectionProtection({
    store: root.store, checkout: root.checkout, identity: root.identity, exec: root.ports.exec, evidence }) });
  reportProjectionLinks(walked.links.filter(path => !(input.reportedLinks ?? []).includes(path)));
  const observed = createProjectionLinkBoundary(walked.links);
  const selection = await prepareMaterializationSelection({ root, index, files: desired.files, boundary: observed, onlyDeleted: input.onlyDeleted });
  index = selection.index;
  const selected = selection.files;
  if (input.onlyDeleted) await reportRemainingArchivedFiles(root, index, walked.files, desired.files);
  if (input.index === null) {
    const inventory = { files: new Set([...walked.files, ...swept.restoredUnindexed]), incomplete: walked.incomplete };
    index = await recordRebuildDiscovery(root, index, inventory, desired.files, whole);
  }
  const files: SwapFile[] = [];
  const reference = await readReference(root.checkout);
  const paths = new Map([...selected].map(([path, record]) => [path, record.reference]));
  const collisions = new Set([...paths].filter(([path, reference]) => {
    const previous = index.entries[path];
    return previous?.kind === "record" && !sameReference(previous.reference, reference);
  }).map(([path]) => path));
  retainUncertainProjectionPaths(index, desired, { paths, removals: collisions });
  const laid = laidProjectionPaths(paths);
  const arrivals = findProjectionArrivals(index, laid);
  index = await removeObsoleteProjectionPaths({ root, index, plan: { paths, removals: collisions, unresolved: false }, renderer, reference, admitsForcedEdit });
  let unlaid = false;
  for (const [path, record] of selected) {
    if (!laid.has(path) || !root.writable(path)) continue;
    const prepared = await prepareMaterializationFile({ root, index, path, record, renderer, rebuilding: input.index === null,
      reference, blocked: selection.boundary(path) !== null, admitsForcedEdit });
    index = prepared.index;
    unlaid ||= prepared.unresolved === true;
    if (prepared.file !== undefined) files.push(prepared.file);
  }
  index = await installMaterializedFiles(input, index, files);
  await ensureProjectionScratch(root);
  const complete = whole && !unlaid && index.archiveDiscoveryPending === undefined && index.archiveRecoveryCopies === undefined;
  index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: materializationTimings(input, { ...index, state: !input.onlyDeleted && complete
      && projectionArrivalsInstalled(index, arrivals) ? input.version : input.index?.state ?? null }, startedAt),
    checkpoint: root.context.checkpoint });
  reportProjectionTripwires(root, index);
  await refreshMaterializationLinks(root, selection.links);
  root.ready = true;
  return { kind: "materialized", index };
}

async function installMaterializedFiles(input: ProjectionMaterializationInput, index: ProjectionIndex,
  files: readonly SwapFile[]): Promise<ProjectionIndex> {
  if (files.length === 0) return index;
  const { root } = input;
  const swapped = await swapBatch({ location: root.location, checkout: root.checkout, index, files, readBack: false,
    writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint, takeIn: root.takeIn,
    hooks: root.context.hooks, refuseChange: archiveChangeRefusals(root) });
  root.context.recordBatch?.(swapped);
  if (input.onlyDeleted !== true) return swapped.index;
  // A take-in that held an edit, or the batch refusing a change, reported it; any other path left unreplaced is named here.
  for (const path of swapped.unreplaced) {
    if (root.unsent.has(path) || swapped.reported.includes(path)) continue;
    const entry = swapped.index.entries[path];
    if (entry?.refused != null) root.context.report?.({ path, copy: null, mark: entry.refused });
    else await reportArchivedProjectionFile(root, index, path);
  }
  return swapped.index;
}

function materializationTimings(input: ProjectionMaterializationInput, index: ProjectionIndex, startedAt: number): ProjectionIndex {
  if (input.onlyDeleted) return index;
  const now = projectionTimingNow(input.root.ports);
  const materialized = recordProjectionTiming(index, "materialization", now - startedAt);
  return input.startTiming === undefined ? materialized : recordProjectionTiming(materialized, "start", now - input.startTiming);
}


function recordSweep(root: ProjectionRootState, swept: SweepResult, observed: boolean): void {
  if (observed) recordProjectionSweep(root, swept);
  root.copies.push(...swept.copies);
  reportLeftCopies(root, swept.left);
}
