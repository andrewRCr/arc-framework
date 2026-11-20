/** Persist a target checkout's authored projection before its caller retires it. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionRemovalContext } from "./removal-check.js";
import type { ProjectionRootBindingInput } from "./engine-binding.js";
import { createProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection } from "./location.js";
import { checkoutHoldsProjection } from "./ownership.js";
import { readProjectionIndex, commitProjectionIndex } from "./index-file.js";
import { readProjectionConfiguration } from "./configuration.js";
import { withProjectionFanOutLock } from "./fan-out-lock.js";
import { bindProjectionRoot } from "./engine-binding.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { createHistoryMemo, type HistoryMemo } from "./base-recovery.js";
import type { Store } from "../contract.js";
import type { RecordReference } from "../identity.js";
import { retryEndedItemHistory } from "../history-retry.js";
import { readRemovalProjectionRoots } from "./removal-files.js";
import { projectedRootPaths } from "../../layout/index.js";
import { walkProjectionRoots } from "./engine-walk.js";
import { createProjectionLinkBoundary, reconcileProjectionLinks } from "./discovery-links.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { checkIgnores } from "./ignore-check.js";
import { recordProjectionIgnoreCheck } from "./ignore-record.js";
import { checkChange, projectionFileReader, readReference } from "./change-detection.js";
import { writableUnder } from "./sweep.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { retriesIndexedEntry, writeBackProjectionFiles } from "./engine-files.js";
import type { ProjectionFileWriteObservation } from "./file-write-observation.js";
import { checkProjectionRemoval, unusableProjectionIndexDetail } from "./removal-check.js";
import { ignoreRefusalMark, retirementName, retirementRefusal, type ProjectionRetirement } from "./removal-verdict.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { join } from "node:path";
import { projectionProcessState } from "./process-state.js";
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import type { Remedy } from "../refusal.js";
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import { persistProjectionAsides, changedProjectionAsides } from "./removal-persist-asides.js";
import { observeUnprojectedPersonalFiles } from "./removal-residual.js";
import { gateRead, projectionReadGate } from "./read-gate.js";
import { canRecoverArchiveEntry, inspectArchivedProjectionFile } from "./archive-inspection.js";
import { waitingEditMark } from "./archive-admission.js";
import { hasArchiveRecording } from "./recording-state.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { retirementSelection, selectArchivePath } from "./archive-selection.js";

/** Scheduling seams for a save concurrent with the retirement operation. */
export interface ProjectionPersistHooks {
  readonly afterFileSelection?: (checkout: string) => Promise<void>;
  readonly beforeAsideCopy?: (checkout: string, path: string, copy: string) => Promise<void>;
  readonly beforeLastCheck?: (checkout: string, pass: number) => Promise<void>;
}

/** Handler-owned creation and scheduling capabilities accompany the command's Store authority. */
export interface ProjectionPersistContext extends ProjectionRemovalContext {
  readonly mint?: ProjectionStubMintPort;
  readonly hooks?: ProjectionPersistHooks;
}

/** Physical persistence remains distinct from the caller's later unlock and removal. */
export type ProjectionPersistResult = Awaited<ReturnType<ProjectionRemovalSlots["persist"]>>;

/** Persist under the target's lease and return only after that lease releases. */
export async function persistProjectionRemoval(checkout: string, context: ProjectionPersistContext): Promise<ProjectionPersistResult> {
  return withPersistedProjection(checkout, context, "remove", root => {
    retireProjectionRoot(root);
    return Promise.resolve({ kind: "persisted" });
  });
}

/** Remove a successfully retired linked target from later work in this command. */
export function retireProjectionRoot(root: ProjectionRootState): void {
  const state = projectionProcessState();
  state.retiring.add(root.checkout);
  state.roots.delete(root.checkout);
}

/** The continuation run under the lease once persistence settles, given the mark for any ignore rules that refuse. */
export type ProjectionPersistCompletion = (root: ProjectionRootState, index: ProjectionIndex,
  ignoreMark?: RefusedMark) => Promise<ProjectionPersistResult>;

/** Keep a successful continuation within the persistence lease and bound root lifetime. */
export async function withPersistedProjection(checkout: string, context: ProjectionPersistContext, disposition: "remove" | "release",
  complete: ProjectionPersistCompletion): Promise<ProjectionPersistResult> {
  try {
    const ports = context.ports?.(checkout) ?? createProjectionEnginePorts(checkout);
    const location = await locateProjection(checkout, ports);
    const disk = await readProjectionIndex(location, await checkoutHoldsProjection(checkout, location), { groups: "all", retry: true });
    if (disk.kind === "no-projection") return await persistUnprojected(checkout, context, disposition);
    if (disk.kind === "unusable") return refuse(unusableProjectionIndexDetail(checkout, disk.cause, disk.header));
    const configuration = await readProjectionConfiguration(ports.exec, checkout);
    if (configuration.identity.status === "no-identity") return { kind: "refused", remedy: configuration.identity.remedy };
    const targetIdentity = configuration.identity.identity;
    if (targetIdentity !== context.identity) return refuse(`The target ${checkout} uses identity ${targetIdentity}. Run removal or release from that checkout under its identity.`);
    const result = await withProjectionFanOutLock(location, async session => {
      const source = retryEndedItemHistory(context.store), history = createHistoryMemo(source);
      const store = invalidateRemovalHistory(source, history);
      return persistUnderLease({ checkout, store, ports, location, configuration, session, register: false, mode: "write-back",
        history, actor: await resolveProjectionActor(ports, location, targetIdentity), mint: context.mint }, context, disposition, complete);
    }, { ...(ports.maxWaitMs === undefined ? {} : { maxWaitMs: ports.maxWaitMs }) }, ports.lock);
    if (result.status === "done") return result.value;
    return refuse(`Projection lease ${result.status} at ${checkout}${result.status === "held" ? `; holder ${JSON.stringify(result.holder)}` : ""}. Retry ${retirementName(disposition)} after the lease is available.`);
  } catch (error) {
    return refuse(`Cannot persist the projection at ${checkout}: ${error instanceof Error ? error.message : String(error)}. Repair it and retry ${retirementName(disposition)}.`);
  }
}

async function persistUnprojected(checkout: string, context: ProjectionPersistContext,
  disposition: "remove" | "release"): Promise<ProjectionPersistResult> {
  const checked = disposition === "release" ? { kind: "passes" } as const
    : await observeUnprojectedPersonalFiles(checkout, context.residualFs);
  return checked.kind === "passes" ? { kind: "persisted" } : checked.kind === "would-refuse"
    ? { kind: "refused", remedy: checked.remedy } : refuse(checked.detail);
}

async function persistUnderLease(input: ProjectionRootBindingInput, context: ProjectionPersistContext, disposition: "remove" | "release",
  complete: ProjectionPersistCompletion): Promise<ProjectionPersistResult> {
  await input.session.step();
  const disk = await readProjectionIndex(input.location, true, { groups: "all" });
  if (disk.kind !== "index") return refuse(unusableProjectionIndexDetail(input.checkout, disk.cause, disk.header));
  let archiveBasis = disk.index;
  const root = await bindProjectionRoot({ ...input, refuseCapturedEdit: (request, read) => {
    if (!request.path.startsWith(".arc/completed/")) return null;
    const prior = archiveBasis.entries[request.path];
    if (canRecoverArchiveEntry(prior)) return null;
    if (request.copy === null && !request.observedEdit && read.blob === request.entry.written) return null;
    return waitingEditMark(input.checkout, request.path, prior !== undefined);
  } });
  try {
    let index = disk.index;
    for (let pass = 1; pass <= 3; pass += 1) {
      archiveBasis = index;
      const observedFrom = projectionProcessState().diagnostics.length;
      const written = await persistFiles(input, root, index, disposition, context.hooks);
      index = written.index;
      if (written.refusal !== undefined) return { kind: "refused", remedy: written.refusal };
      const unsent = unsentRefusal(root, observedFrom, disposition, written.ignoreMark);
      if (unsent !== undefined) return { kind: "refused", remedy: unsent };
      const copies = await persistProjectionAsides(root, index, disposition, context.hooks, written.ignoreMark);
      index = copies.index;
      if (copies.refusal !== undefined) return { kind: "refused", remedy: copies.refusal };
      const confirmed = await confirmPersistedProjection(root, index, written.files, context, disposition, pass);
      if (confirmed.kind === "refused") return confirmed;
      if (confirmed.kind === "changed") continue;
      archiveBasis = index;
      return await complete(root, index, written.ignoreMark);
    }
    return refuse(`Files kept changing at ${root.checkout}. Let the saves finish, then retry ${retirementName(disposition)}.`);
  } finally { root.checkpoint = null; }
}

async function confirmPersistedProjection(root: ProjectionRootState, index: ProjectionIndex, paths: readonly string[],
  context: ProjectionPersistContext, disposition: ProjectionRetirement, pass: number): Promise<
    { kind: "settled" | "changed" } | { kind: "refused"; remedy: Remedy }
> {
  await context.hooks?.beforeLastCheck?.(root.checkout, pass);
  const checked = await checkProjectionRemoval(root.checkout, context, disposition);
  if (checked.kind === "would-refuse") return { kind: "refused", remedy: checked.remedy };
  if (checked.kind === "unobservable") return { kind: "refused", remedy: { text: checked.detail } };
  if (await changedProjectionAsides(root, index)) return { kind: "changed" };
  await root.checkpoint?.();
  const changed = await changedProjectionFiles(root, index, paths);
  return changed.kind === "blocked"
    ? { kind: "refused", remedy: retirementRefusal(root.checkout, changed.path, changed.mark, disposition) } : changed;
}

async function persistFiles(input: ProjectionRootBindingInput, root: ProjectionRootState, initial: ProjectionIndex,
  disposition: ProjectionRetirement, hooks?: ProjectionPersistHooks): Promise<{
    index: ProjectionIndex; files: readonly string[]; refusal?: Remedy; ignoreMark?: RefusedMark;
  }> {
  const walked = await walkPersistedRoots(root), reference = await readReference(root.checkout);
  const ignores = await checkIgnores({ guard: { root: root.checkout, identity: root.identity, exec: root.ports.execInput, fs: root.ports.fs },
    records: initial.ignoreFiles, recordedGuard: initial.ignoreGuard, reference,
    format: root.context.format, ignoreRules: input.configuration.ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules });
  root.writable = writableUnder(ignores, guardedProjectionRoots(root.identity).map(root => root.path));
  let index = await reconcileProjectionLinks(root, recordProjectionIgnoreCheck(initial, ignores));
  index = await reconcileProjectionHandoffs(root, index, Object.keys(index.entries));
  const diagnosticFrom = projectionProcessState().diagnostics.length;
  const observed: ProjectionFileWriteObservation[] = [];
  const selected = await selectPersistedFiles(root, index, walked.files, reference, disposition);
  await hooks?.afterFileSelection?.(root.checkout);
  index = await writeBackProjectionFiles(root, index, selected.files, undefined, outcome => { observed.push(outcome); });
  index = await commitProjectionIndex({ checkout: root.checkout, location: root.location, index, checkpoint: root.context.checkpoint });
  if (selected.refusal !== undefined) return { index, files: selected.files, refusal: selected.refusal };
  const ignoreMark = ignores.kind === "refused" ? ignoreRefusalMark(ignores.reason, ignores.remedy) : undefined;
  for (const { path, result, installation } of observed) {
    if (result.answer === "no-edit" || result.answer === "taken-in" && installation === "attempted") continue;
    const reported = projectionProcessState().diagnostics.slice(diagnosticFrom).reverse().find(each => each.path === path)?.mark;
    const mark = ignoreMark !== undefined && !root.writable(path) ? ignoreMark : reported ?? result.entry.refused;
    const refusal = mark === null
      ? { text: `Run arc save from ${root.checkout} to finish ${path}, then retry ${retirementName(disposition)}.` }
      : retirementRefusal(root.checkout, path, mark, disposition);
    return { index, files: selected.files, refusal };
  }
  return { index, files: selected.files, ...(ignoreMark === undefined ? {} : { ignoreMark }) };
}

async function selectPersistedFiles(root: ProjectionRootState, index: ProjectionIndex, paths: readonly string[],
  reference: bigint | null, disposition: ProjectionRetirement): Promise<{ files: string[]; refusal?: Remedy }> {
  const files: string[] = [];
  let refusal: Remedy | undefined;
  const walked = new Set(paths);
  for (const path of retirementSelection(index, paths)) {
    // An archive path this checkout does not own is left untouched, and retirement refuses over it.
    const destination = selectArchivePath(root, path, { report: false });
    if (destination !== null) {
      refusal ??= retirementRefusal(root.checkout, path, destination, disposition);
      continue;
    }
    const entry = index.entries[path];
    // The write-back walk can recover a staged receipt under the checkout's lease.
    if (hasArchiveRecording(entry)) {
      files.push(path);
      continue;
    }
    // A file gone from the walk is finished only where the command's walk retries its entry; release refuses over any
    // other, as its removal check predicts, leaving it to arc save.
    if (!walked.has(path) && (entry === undefined || !retriesIndexedEntry(root.context.verb, path, entry))) continue;
    const blocked = (await inspectArchivedProjectionFile(root, index, path, { reference }))?.mark ?? null;
    if (blocked !== null) refusal ??= retirementRefusal(root.checkout, path, blocked, disposition);
    else if (!path.startsWith(".arc/completed/") || entry !== undefined) files.push(path);
  }
  return { files, ...(refusal === undefined ? {} : { refusal }) };
}

async function walkPersistedRoots(root: ProjectionRootState): ReturnType<typeof walkProjectionRoots> {
  const roots = await readRemovalProjectionRoots(root.checkout, projectedRootPaths(root.identity), root.ports);
  const walked = await walkProjectionRoots(root.checkout, roots, root.ports.walkFs, root.ports.linkFs);
  root.blockedByLink = createProjectionLinkBoundary(walked.links);
  return walked;
}

type FinalProjectionFiles = { kind: "settled" } | { kind: "changed" } | { kind: "blocked"; path: string; mark: RefusedMark };

async function changedProjectionFiles(root: ProjectionRootState, index: ProjectionIndex,
  selected: readonly string[]): Promise<FinalProjectionFiles> {
  const walked = await walkPersistedRoots(root), reference = await readReference(root.checkout);
  const paths = new Set(walked.files);
  const selections = retirementSelection(index, [...paths, ...selected.filter(path => path.startsWith(".arc/completed/"))]);
  for (const path of selections) {
    try {
      if (await observeFinalProjectionFile(root, index, path, reference, paths.has(path))) return { kind: "changed" };
    } catch (error) {
      if (error instanceof ArchiveDestinationBlocked) return { kind: "blocked", path, mark: error.mark };
      throw error;
    }
  }
  return { kind: "settled" };
}

async function observeFinalProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string, reference: bigint | null,
  walked: boolean): Promise<boolean> {
  const entry = index.entries[path];
  if (entry?.kind !== "record") return walked;
  const reader = projectionFileReader(root.checkout, path);
  const absolute = join(root.checkout, path);
  const change = await checkChange({ path: absolute, recorded: entry.stat, written: entry.written,
    reference, format: root.context.format }, reader.read, reader.stat);
  if (change.status !== "changed") return false;
  const gated = await gateRead({ path: absolute, markdown: path.endsWith(".md") }, projectionReadGate(root.checkout, path));
  if (gated.kind === "no-edit" || gated.kind === "absent") return false;
  const unchanged = await readUnchangedProjectionFile(root.context, {
    checkout: root.checkout, path, copy: null, entry,
    base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob },
  });
  return unchanged === null;
}

function refuse(text: string): ProjectionPersistResult { return { kind: "refused", remedy: { text } }; }

/** A file sent but not installed: the ignore rules hold it where they leave its path unwritable, else its own mark does. */
function unsentRefusal(root: ProjectionRootState, observedFrom: number, disposition: ProjectionRetirement,
  ignoreMark: RefusedMark | undefined): Remedy | undefined {
  const [path] = root.unsent;
  if (path === undefined) return undefined;
  const mark = ignoreMark !== undefined && !root.writable(path) ? ignoreMark
    : projectionProcessState().diagnostics.slice(observedFrom).reverse().find(each => each.path === path)?.mark;
  return mark === undefined ? { text: `Run arc save from ${root.checkout} to finish ${path}, then retry ${retirementName(disposition)}.` }
    : retirementRefusal(root.checkout, path, mark, disposition);
}

function invalidateRemovalHistory(store: Store, history: HistoryMemo): Store {
  const drop = (reference: RecordReference): void => {
    history.drop(reference);
    projectionProcessState().history?.drop(reference);
  };
  return {
    capabilities: store.capabilities,
    write: async input => {
      const result = await store.write(input);
      if (result.status === "ok") drop(result.result.reference);
      return result;
    },
    batch: async input => {
      const result = await store.batch(input);
      if (result.status === "ok") for (const write of result.result.writes) drop(write.reference);
      return result;
    },
    read: input => store.read(input), list: input => store.list(input), version: () => store.version(),
    history: input => store.history(input), changes: input => store.changes(input), lookup: input => store.lookup(input),
    pull: input => store.pull(input), push: input => store.push(input), maintain: () => store.maintain(),
  };
}
