/** Refresh indexed files from a captured source state while retaining the caller's observed index. */
import { prepareConflictedRefresh, type ConflictedRefreshContext } from "./conflicted-refresh.js";
import { gateRead } from "./read-gate.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { unshownConflicts } from "./held-conflicts.js";
import { sameReference, type RecordReference, type StateVersion } from "../identity.js";
import { createHistoryMemo } from "./base-recovery.js";
import { createProjectionReadMemo, type ProjectionSource } from "./record-source.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionConfiguration } from "./configuration.js";
import { movedProjectionChanges, removeObsoleteProjectionPaths } from "./refresh-removals.js";
import { planProjectionRefresh, type ProjectionRefreshPlan } from "./refresh-plan.js";
import { createRecordRenderer, type RecordRenderer, type RenderedRecord } from "./record-render.js";
import { createProjectionProtection } from "./protection.js";
import type { ProjectionProtectionEvidence } from "./protection-evidence.js";
import { createProjectionProtectionEvidence } from "./protection-evidence.js";
import { prepareMaterializationFile, projectionEntryForRecord } from "./materialization-file.js";
import { readReference } from "./change-detection.js";
import { withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { findProjectionArrivals, projectionArrivalsInstalled } from "./ownership-handoff.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { planProjectionRebuild } from "./refresh-rebuild.js";

/** The saved source state and index held by the caller's lease. */
export interface ProjectionRefreshRequest {
  readonly source: ProjectionSource;
  readonly version: StateVersion;
  readonly index: ProjectionIndex;
  readonly evidence?: ProjectionProtectionEvidence;
}
/** Destination bindings and the configuration already observed for this command. */
export interface ProjectionRefreshInput extends ProjectionRefreshRequest {
  readonly root: ProjectionRootState;
  readonly configuration: ProjectionConfiguration;
}

/** Lay changed and pending files using shared rendering reads and live replacement admission. */
export async function refreshProjectionRoot(input: ProjectionRefreshInput): Promise<ProjectionIndex> {
  const { root, version } = input;
  const source = createProjectionReadMemo(input.source);
  const index = input.index;
  const changes = index.state === null || index.state === version ? { status: "ok" as const, result: [] }
    : await source.changes({ from: index.state, to: version });
  if (changes.status === "refused" && changes.refusal.code !== "state-unresolvable") {
    root.context.report?.({ path: root.checkout, copy: null, mark: markStoreRefusal(changes.refusal) });
    return index;
  }
  const planned = changes.status === "refused" ? await planProjectionRebuild({ ...input, source })
    : await planProjectionRefresh({ ...input, source, changes: changes.result });
  if (planned.paths.size === 0 && planned.removals.size === 0 && index.state === version) { root.ready = true; return index; }
  return (await applyProjectionRefresh({ ...input, source }, planned)).index;
}

/** Apply a complete path plan to the caller's held index without repeating its sweep or write-back. */
export async function applyProjectionRefresh(input: ProjectionRefreshInput, planned: ProjectionRefreshPlan,
  options: { advanceState?: boolean } = {}): Promise<{
  index: ProjectionIndex; complete: boolean;
}> {
  const { root, source, version } = input;
  let index = input.index;
  const evidence = input.evidence ?? createProjectionProtectionEvidence({ source, checkout: root.checkout, exec: root.ports.exec });
  const renderContext: ConflictedRefreshContext = { store: source, memo: root.context.memo ?? createHistoryMemo(root.store),
    format: root.context.format, actor: root.context.actor,
    protection: createProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity, exec: root.ports.exec, evidence }) };
  const renderer = createRecordRenderer(renderContext);
  const reference = await readReference(root.checkout), files: SwapFile[] = [];
  const arrivals = findProjectionArrivals(index, planned.paths);
  const moved = movedProjectionChanges(index, planned);
  index = await removeObsoleteProjectionPaths({ root, index, plan: planned, renderer, reference });
  let unresolved = planned.unresolved;
  for (const [path, target] of planned.paths) {
    const prepared = await prepareIndexedFile({ root, source, renderer, renderContext, reference, index, path, target });
    index = prepared.index;
    const entry = index.entries[path];
    if (entry?.kind === "record" && moved.has(path)) index = withProjectionEntry(index, path, { ...entry, changed: true });
    unresolved ||= prepared.unresolved;
    if (prepared.file !== undefined) files.push(moved.has(path) ? { ...prepared.file,
      replace: { ...prepared.file.replace, entry: { ...prepared.file.replace.entry, changed: true } } } : prepared.file);
  }
  if (files.length > 0) {
    const swapped = await swapBatch({ location: root.location, checkout: root.checkout, index, files, readBack: false,
      writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint, takeIn: root.takeIn, hooks: root.context.hooks });
    root.context.recordBatch?.(swapped);
    index = swapped.index;
  }
  const complete = !unresolved && projectionArrivalsInstalled(index, arrivals);
  index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: { ...index, state: complete && options.advanceState !== false ? version : input.index.state }, checkpoint: root.context.checkpoint });
  root.ready = true;
  return { index, complete };
}


interface IndexedFileInput {
  readonly root: ProjectionRootState;
  readonly source: ProjectionSource;
  readonly renderer: RecordRenderer;
  readonly renderContext: ConflictedRefreshContext;
  readonly reference: bigint | null;
  readonly index: ProjectionIndex;
  readonly path: string;
  readonly target: RecordReference;
}

async function prepareIndexedFile(input: IndexedFileInput): Promise<{ index: ProjectionIndex; file?: SwapFile; unresolved: boolean }> {
  const { root, index, path } = input;
  if ((await readProjectionLinkBoundary(root.checkout, [path]))(path) !== null) return { index, unresolved: true };
  const prior = index.entries[path];
  if (prior !== undefined && prior.kind !== "record") return { index, unresolved: false };
  const read = await input.source.read({ reference: input.target });
  if (prior === undefined && read.status !== "ok") return { index, unresolved: true };
  const entry = prior ?? projectionEntryForRecord((read as Extract<typeof read, { status: "ok" }>).result, path, root.context.format);
  if (!root.writable(path)) return { index: withProjectionEntry(index, path, { ...entry, pending: true }), unresolved: false };
  if (read.status === "refused") {
    if (root.unsent.has(path)) return { index, unresolved: true };
    const mark = markStoreRefusal(read.refusal);
    root.context.report?.({ path, copy: null, mark });
    return { index: withProjectionEntry(index, path, { ...entry, pending: true, refused: mark }), unresolved: true };
  }
  if (prior?.kind === "record" && !sameReference(prior.reference, read.result.reference)) {
    return { ...await prepareMaterializationFile({ root, index, path, record: read.result, renderer: input.renderer,
      rebuilding: false, reference: input.reference, blocked: root.blockedByLink(path) !== null }), unresolved: true };
  }
  if (root.unsent.has(path)) return { index: withProjectionEntry(index, path,
    { ...entry, pending: true, unshown: unshownConflicts(entry, read.result.conflicts) }), unresolved: false };
  return prepareCurrentFile(input, entry, read.result);
}

async function prepareCurrentFile(input: IndexedFileInput, entry: RecordEntry, record: StoreRecord): Promise<{ index: ProjectionIndex; file?: SwapFile; unresolved: boolean }> {
  const { root, path } = input;
  let rendered: RenderedRecord | undefined;
  if (entry.markers !== null && !entry.withheld && root.blockedByLink(path) === null) {
    const gate = await gateRead({ path: join(root.checkout, path), markdown: false });
    if (gate.kind === "read") {
      const prepared = await prepareConflictedRefresh(input.renderContext, { path, entry, current: record,
        text: await readFile(join(root.checkout, path), "utf8") });
      if (prepared.kind === "pending") {
        root.context.report?.({ path, copy: null, mark: prepared.mark });
        return { index: withProjectionEntry(input.index, path, { ...entry, pending: true, refused: prepared.mark,
          unshown: unshownConflicts(entry, record.conflicts) }), unresolved: false };
      }
      rendered = prepared.rendered;
    }
  }
  return { ...await prepareMaterializationFile({ root, index: input.index, path, record, renderer: input.renderer, rendered,
    rebuilding: false, reference: input.reference, blocked: root.blockedByLink(path) !== null }), unresolved: false };
}
