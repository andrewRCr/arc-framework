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
import { isEvidenceHeldEntry, prepareMaterializationFile, projectionEntryForRecord, settleHeldMarks } from "./materialization-file.js";
import { readReference } from "./change-detection.js";
import { withProjectionEntry } from "./index-memory.js";
import { commitProjectionIndex } from "./index-file.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { swapBatch, type SwapFile } from "./swap.js";
import { findProjectionArrivals, projectionArrivalsInstalled } from "./ownership-handoff.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import { planProjectionRebuild } from "./refresh-rebuild.js";
import { laidProjectionPaths } from "./discovery-exclusions.js";
import { markArrivingRecord } from "./changed-mark.js";

/** The saved source state and index held by the caller's lease. */
export interface ProjectionRefreshRequest {
  readonly source: ProjectionSource;
  readonly version: StateVersion;
  readonly index: ProjectionIndex;
  readonly evidence?: ProjectionProtectionEvidence;
  /** The enclosing leased operation publishes the returned index with its own final metadata. */
  readonly publication?: "caller";
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
  const reference = await readReference(root.checkout);
  const laid = laidProjectionPaths(planned.paths);
  const arrivals = findProjectionArrivals(index, laid);
  const moved = movedProjectionChanges(index, planned, laid);
  // A moved record's old path, the only holder of its changed or opened mark, waits until its new path takes the mark.
  const deferred = new Set([...moved.values()].flat());
  index = await removeObsoleteProjectionPaths({ root, index, plan: withRemovals(planned, [...planned.removals].filter(path => !deferred.has(path))),
    renderer, reference });
  const prepared = await prepareLaidPaths({ root, source, renderer, renderContext, reference, rebuilding: planned.rebuild === true },
    index, laid, moved);
  index = prepared.index;
  if (planned.rebuild === true && !planned.unresolved) index = settleHeldMarks(index, planned.paths, root.checkout);
  if (prepared.files.length > 0) {
    const swapped = await swapBatch({ location: root.location, checkout: root.checkout, index, files: prepared.files, readBack: false,
      settlementPublication: "caller", writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint,
      takeIn: root.takeIn, hooks: root.context.hooks });
    root.context.recordBatch?.(swapped);
    index = swapped.index;
  }
  const settled = await settleMovedPaths({ root, renderer, reference, plan: planned }, index, moved, prepared.marked);
  index = settled.index;
  const complete = !planned.unresolved && !prepared.unresolved && !settled.unresolved && projectionArrivalsInstalled(index, arrivals);
  index = { ...index, state: complete && options.advanceState !== false ? version : input.index.state };
  if (input.publication !== "caller") index = await commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index, checkpoint: root.context.checkpoint });
  root.ready = true;
  return { index, complete };
}

/**
 * Prepare each laid path, carrying a moved record's changed or opened mark to its new path wherever the pass leaves a
 * carrier.
 */
async function prepareLaidPaths(base: Omit<IndexedFileInput, "index" | "path" | "target">, initial: ProjectionIndex,
  laid: ReadonlyMap<string, RecordReference>, moved: ReadonlyMap<string, readonly string[]>): Promise<{
  index: ProjectionIndex; files: SwapFile[]; unresolved: boolean; marked: ReadonlySet<string>;
}> {
  let index = initial, unresolved = false;
  const files: SwapFile[] = [], marked = new Set<string>();
  for (const [path, target] of laid) {
    const opened = moved.get(path)?.some(old => index.entries[old]?.opened === true) === true;
    const prior = index.entries[path];
    if (opened && prior?.kind === "record") index = withProjectionEntry(index, path, markArrivingRecord(prior, target, true));
    const prepared = await prepareIndexedFile({ ...base, index, path, target, ...(opened ? { opened: true } : {}) });
    const carried = moved.has(path) ? markMovedPath(prepared, path, target) : null;
    if (carried !== null) marked.add(path);
    const result = carried ?? prepared;
    index = result.index;
    unresolved ||= prepared.unresolved;
    if (result.file !== undefined) files.push(result.file);
  }
  return { index, files, unresolved, marked };
}

/** Remove a moved record's old path once its new path took the mark; otherwise keep it pending and marked for the next pass. */
async function settleMovedPaths(input: Omit<Parameters<typeof removeObsoleteProjectionPaths>[0], "index">, initial: ProjectionIndex,
  moved: ReadonlyMap<string, readonly string[]>, marked: ReadonlySet<string>): Promise<{ index: ProjectionIndex; unresolved: boolean }> {
  let index = initial, unresolved = false;
  const settled = [...moved].flatMap(([path, old]) => marked.has(path) ? old : []);
  for (const path of new Set([...moved.values()].flat())) {
    if (settled.includes(path)) continue;
    const entry = index.entries[path];
    if (entry?.kind === "record") index = withProjectionEntry(index, path, { ...entry, pending: true });
    unresolved = true;
  }
  if (settled.length > 0) index = await removeObsoleteProjectionPaths({ ...input, index, plan: withRemovals(input.plan, settled) });
  return { index, unresolved };
}

/**
 * A path the plan moves is the checkout's change: the record moved there is marked changed, and so is any file laid there.
 * Null where the pass left no record or file there to carry the mark, so its old path keeps it.
 */
function markMovedPath(prepared: IndexedFileResult, path: string, reference: RecordReference): IndexedFileResult | null {
  const entry = prepared.index.entries[path];
  const index = entry?.kind === "record" ? withProjectionEntry(prepared.index, path, markArrivingRecord(entry, reference)) : prepared.index;
  if (prepared.file === undefined) return entry?.kind === "record" ? { ...prepared, index } : null;
  const { replace } = prepared.file;
  return { ...prepared, index, file: { ...prepared.file, replace: { ...replace, entry: { ...replace.entry, changed: true } } } };
}

function withRemovals(plan: ProjectionRefreshPlan, removals: Iterable<string>): ProjectionRefreshPlan {
  return { ...plan, removals: new Set(removals) };
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
  readonly rebuilding: boolean;
  readonly opened?: true;
}

type IndexedFileResult = { index: ProjectionIndex; file?: SwapFile; unresolved: boolean };

async function prepareIndexedFile(input: IndexedFileInput): Promise<IndexedFileResult> {
  const { root, index, path } = input;
  const prior = index.entries[path];
  if (await leftToLaterPass(input, prior)) return { index, unresolved: true };
  if (prior !== undefined && prior.kind !== "record") return input.rebuilding && isEvidenceHeldEntry(prior) ? settleEvidenceHeldFile(input) : { index, unresolved: false };
  const read = await input.source.read({ reference: input.target });
  if (prior === undefined && read.status !== "ok") {
    root.context.report?.({ path, copy: null, mark: markStoreRefusal(read.refusal) });
    return { index, unresolved: true };
  }
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
      rebuilding: false, opened: input.opened, reference: input.reference, blocked: root.blockedByLink(path) !== null }), unresolved: true };
  }
  if (root.unsent.has(path)) return { index: withProjectionEntry(index, path,
    { ...entry, pending: true, unshown: unshownConflicts(entry, read.result.conflicts) }), unresolved: false };
  return prepareCurrentFile(input, entry, read.result);
}

/** A link at or above the path, or an ownership handoff in flight there, leaves the path to a later pass. */
async function leftToLaterPass(input: IndexedFileInput, prior: ProjectionIndex["entries"][string] | undefined): Promise<boolean> {
  if ((await readProjectionLinkBoundary(input.root.checkout, [input.path]))(input.path) !== null) return true;
  // An ownership handoff in flight is reconciliation's to settle, under the mark naming both identities.
  return prior?.kind === "record" && prior.handoff !== undefined;
}

/** Settle an evidence-held file by the rebuild rule now that the rebuild lays a record at its path: unedited bytes refresh. */
async function settleEvidenceHeldFile(input: IndexedFileInput): Promise<IndexedFileResult> {
  const { root, index, path } = input;
  if (!root.writable(path)) return { index, unresolved: true };
  const read = await input.source.read({ reference: input.target });
  if (read.status !== "ok") {
    root.context.report?.({ path, copy: null, mark: markStoreRefusal(read.refusal) });
    return { index, unresolved: true };
  }
  return { unresolved: false, ...await prepareMaterializationFile({ root, index: withProjectionEntry(index, path, undefined), path,
    record: read.result, renderer: input.renderer, rebuilding: true, reference: input.reference, blocked: root.blockedByLink(path) !== null }) };
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
  return { unresolved: false, ...await prepareMaterializationFile({ root, index: input.index, path, record, renderer: input.renderer,
    rendered, rebuilding: false, opened: input.opened, reference: input.reference, blocked: root.blockedByLink(path) !== null }) };
}
