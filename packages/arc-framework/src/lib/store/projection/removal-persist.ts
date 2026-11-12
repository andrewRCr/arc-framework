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
import { checkChange, readReference } from "./change-detection.js";
import { writableUnder } from "./sweep.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import { writeBackProjectionFiles, type ProjectionFileWriteObservation } from "./engine-files.js";
import { checkProjectionRemoval } from "./removal-check.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import { join } from "node:path";
import { projectionProcessState } from "./process-state.js";
import type { ProjectionStubMintPort } from "./stub-mint-port.js";
import type { Remedy } from "../refusal.js";
import { readUnchangedProjectionFile } from "./unchanged-file.js";
import { persistProjectionAsides, changedProjectionAsides } from "./removal-persist-asides.js";
import { observeUnprojectedPersonalFiles } from "./removal-residual.js";
import { gateRead } from "./read-gate.js";

/** Scheduling seams for a save concurrent with the retirement operation. */
export interface ProjectionPersistHooks {
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

/** Keep a successful continuation within the persistence lease and bound root lifetime. */
export async function withPersistedProjection(checkout: string, context: ProjectionPersistContext, disposition: "remove" | "release",
  complete: (root: ProjectionRootState, index: ProjectionIndex) => Promise<ProjectionPersistResult>): Promise<ProjectionPersistResult> {
  try {
    const ports = context.ports?.(checkout) ?? createProjectionEnginePorts(checkout);
    const location = await locateProjection(checkout, ports);
    const disk = await readProjectionIndex(location, await checkoutHoldsProjection(checkout, location), { groups: "all", retry: true });
    if (disk.kind === "no-projection") return await persistUnprojected(checkout, context, disposition);
    if (disk.kind === "unusable") return refuse(`Run arc save from ${checkout} to rebuild its ${disk.cause} projection index, then retry removal.`);
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
    return refuse(`Projection lease ${result.status} at ${checkout}${result.status === "held" ? `; holder ${JSON.stringify(result.holder)}` : ""}. Retry removal after the lease is available.`);
  } catch (error) {
    return refuse(`Cannot persist the projection at ${checkout}: ${error instanceof Error ? error.message : String(error)}. Repair it and retry removal.`);
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
  complete: (root: ProjectionRootState, index: ProjectionIndex) => Promise<ProjectionPersistResult>): Promise<ProjectionPersistResult> {
  await input.session.step();
  const disk = await readProjectionIndex(input.location, true, { groups: "all" });
  if (disk.kind !== "index") return refuse(`Run arc save from ${input.checkout} to rebuild the projection index, then retry removal.`);
  const root = await bindProjectionRoot(input);
  try {
    let index = disk.index;
    for (let pass = 1; pass <= 3; pass += 1) {
      const observedFrom = projectionProcessState().diagnostics.length;
      const written = await persistFiles(input, root, index);
      index = written.index;
      if (written.refusal !== undefined) return { kind: "refused", remedy: written.refusal };
      const unsent = unsentRefusal(root, observedFrom);
      if (unsent !== undefined) return { kind: "refused", remedy: unsent };
      const copies = await persistProjectionAsides(root, index, context.hooks, written.ignoreRefusal);
      index = copies.index;
      if (copies.refusal !== undefined) return { kind: "refused", remedy: copies.refusal };
      await context.hooks?.beforeLastCheck?.(root.checkout, pass);
      const checked = await checkProjectionRemoval(root.checkout, context, disposition);
      if (checked.kind === "would-refuse") return { kind: "refused", remedy: checked.remedy };
      if (checked.kind === "unobservable") return refuse(checked.detail);
      if (await changedProjectionFiles(root, index) || await changedProjectionAsides(root, index)) continue;
      await input.session.step();
      return await complete(root, index);
    }
    return refuse(`Files kept changing at ${root.checkout}. Let the saves finish, then retry removal.`);
  } finally { root.checkpoint = null; }
}

async function persistFiles(input: ProjectionRootBindingInput, root: ProjectionRootState, initial: ProjectionIndex): Promise<{ index: ProjectionIndex; refusal?: Remedy; ignoreRefusal?: Remedy }> {
  const walked = await walkPersistedRoots(root);
  const ignores = await checkIgnores({ guard: { root: root.checkout, identity: root.identity, exec: root.ports.execInput, fs: root.ports.fs },
    records: initial.ignoreFiles, recordedGuard: initial.ignoreGuard, reference: await readReference(root.checkout),
    format: root.context.format, ignoreRules: input.configuration.ignoreRules,
    readIgnoreRules: async () => (await readProjectionConfiguration(root.ports.exec, root.checkout)).ignoreRules });
  root.writable = writableUnder(ignores, guardedProjectionRoots(root.identity).map(root => root.path));
  let index = await reconcileProjectionLinks(root, recordProjectionIgnoreCheck(initial, ignores));
  index = await reconcileProjectionHandoffs(root, index, Object.keys(index.entries));
  const diagnosticFrom = projectionProcessState().diagnostics.length;
  const observed: ProjectionFileWriteObservation[] = [];
  index = await writeBackProjectionFiles(root, index, walked.files, undefined, outcome => { observed.push(outcome); });
  index = await commitProjectionIndex({ checkout: root.checkout, location: root.location, index, checkpoint: root.context.checkpoint });
  for (const { path, result, installation } of observed) {
    if (result.answer === "no-edit" || result.answer === "taken-in" && installation === "attempted") continue;
    const reported = projectionProcessState().diagnostics.slice(diagnosticFrom).reverse().find(each => each.path === path)?.mark;
    const refusal = ignores.kind === "refused" && !root.writable(path) ? { text: ignores.remedy }
      : reported?.remedy ?? result.entry.refused?.remedy ?? { text: `Run arc save from ${root.checkout} to finish ${path}, then retry removal.` };
    return { index, refusal };
  }
  return { index, ...(ignores.kind === "refused" ? { ignoreRefusal: { text: ignores.remedy } } : {}) };
}

async function walkPersistedRoots(root: ProjectionRootState): ReturnType<typeof walkProjectionRoots> {
  const roots = await readRemovalProjectionRoots(root.checkout, projectedRootPaths(root.identity), root.ports);
  const walked = await walkProjectionRoots(root.checkout, roots, root.ports.walkFs, root.ports.linkFs);
  root.blockedByLink = createProjectionLinkBoundary(walked.links);
  return walked;
}

async function changedProjectionFiles(root: ProjectionRootState, index: ProjectionIndex): Promise<boolean> {
  const walked = await walkPersistedRoots(root), reference = await readReference(root.checkout);
  for (const path of walked.files) {
    const entry = index.entries[path];
    if (entry?.kind !== "record") return true;
    const change = await checkChange({ path: join(root.checkout, path), recorded: entry.stat, written: entry.written,
      reference, format: root.context.format });
    if (change.status !== "changed") continue;
    const gated = await gateRead({ path: join(root.checkout, path), markdown: path.endsWith(".md") });
    if (gated.kind === "no-edit" || gated.kind === "absent") continue;
    if (await readUnchangedProjectionFile(root.context, {
      checkout: root.checkout, path, copy: null, entry,
      base: path.endsWith(".md") ? { kind: "stamp", stamp: null } : { kind: "blob", blob: entry.base.blob },
    }) === null) return true;
  }
  return false;
}

function refuse(text: string): ProjectionPersistResult { return { kind: "refused", remedy: { text } }; }

function unsentRefusal(root: ProjectionRootState, observedFrom: number): Remedy | undefined {
  const [path] = root.unsent;
  if (path === undefined) return undefined;
  const mark = projectionProcessState().diagnostics.slice(observedFrom).reverse().find(each => each.path === path)?.mark;
  return mark?.remedy ?? { text: `Run arc save from ${root.checkout} to finish ${path}, then retry removal.` };
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
