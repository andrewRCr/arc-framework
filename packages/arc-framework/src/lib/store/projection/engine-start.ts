/** Initialization performed inside the command's own projection lease. */
import { readCheckoutLayoutContext } from "../checkout-layout.js";
import { createHistoryMemo } from "./base-recovery.js";
import { readProjectionConfiguration, type ProjectionConfiguration } from "./configuration.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { readProjectionIndex } from "./index-file.js";
import { createWriteBackPort } from "./write-back.js";
import { sweepAsideFolder, writableUnder } from "./sweep.js";
import { walkProjectionRoots } from "./engine-walk.js";
import { writeBackProjectionFiles } from "./engine-files.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import type { ProjectionCommandInput, ProjectionStart } from "./engine.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionLockSession } from "./lock.js";
import type { ReadBackContext } from "./read-back.js";
import { reportProjectionCopy, reportProjectionLinks } from "./report.js";
import { selectProjectionResolution, recheckProjectionResolution } from "./save-resolution.js";
import { sameReference } from "../identity.js";
import type { ProjectionIndex } from "./index-schema.js";
import { bindProjectionRights, refuseProjectionEdit } from "./rights-binding.js";
import { createProjectionProtection } from "./protection.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { interpretProjectionView } from "./view-settings.js";
import { createProjectionLinkBoundary, reconcileProjectionLinks } from "./discovery-links.js";

/** Start independent reads together, drain them all, then sweep and take in files under the lease. */
export async function startUnderLease(input: ProjectionCommandInput, ports: ProjectionEnginePorts,
  location: ProjectionLocation, session: ProjectionLockSession, unsent: Set<string>): Promise<ProjectionStart> {
  const state = projectionProcessState();
  state.lockHeld = true;
  let root: ProjectionRootState | undefined;
  try {
    await session.step();
    const configuration = observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
    const version = input.store.version();
    const shared = walkProjectionRoots(input.checkout, PROJECTED_LIFECYCLE_ROOTS.filter(path => input.mode === "save" || path !== ".arc/completed"), ports.walkFs);
    const personal = configuration.then(config => config.identity.status === "no-identity" ? { files: [], links: [] }
      : walkProjectionRoots(input.checkout, projectedRootPaths(config.identity.identity).filter(path => path.startsWith(".arc/user/")), ports.walkFs));
    const read = await Promise.allSettled([configuration, version, shared, personal] as const);
    const config = fulfilled(read[0]);
    if (config.identity.status === "no-identity") {
      const skip = { reason: "no-identity" as const, mark: { reason: `Projection disabled: ${config.identity.cause} identity.`, remedy: config.identity.remedy } };
      state.skip = skip;
      return { kind: "skipped", skip, pending: read[2].status === "fulfilled" ? read[2].value.files : [] };
    }
    const saved = fulfilled(read[1]);
    const sharedWalk = fulfilled(read[2]), personalWalk = fulfilled(read[3]);
    const files = [...sharedWalk.files, ...personalWalk.files].sort();
    reportProjectionLinks([...sharedWalk.links, ...personalWalk.links]);
    await session.step();
    if (saved.status === "refused") return { kind: "refused", mark: { reason: saved.refusal.condition, remedy: saved.refusal.remedy } };
    const disk = await readProjectionIndex(location, false);
    if (disk.kind === "no-projection") {
      await bindResolution(input, null);
      return { kind: "no-projection" };
    }
    if (disk.kind === "unusable") return { kind: "refused", mark: { reason: `Projection index is ${disk.cause}.`,
      remedy: { text: "Restore a readable projection index, then retry; existing projected files have been preserved." } } };
    await bindResolution(input, disk.index);
    root = await bindRoot(input, ports, location, config, session, unsent, [...sharedWalk.links, ...personalWalk.links]);
    state.roots.set(input.checkout, root);
    const index = await reconcileProjectionLinks(root, disk.index);
    const swept = await sweepAsideFolder({ location, checkout: input.checkout, index, format: config.objectFormat,
      blockedByLink: root.blockedByLink,
      takeIn: root.takeIn, writer: root.context.writer, checkpoint: root.context.checkpoint,
      ignoreRules: config.ignoreRules, readIgnoreRules: async () => (await readProjectionConfiguration(ports.exec, input.checkout)).ignoreRules,
      guard: { root: input.checkout, identity: root.identity, exec: ports.execInput, fs: ports.fs } });
    root.writable = writableUnder(swept.ignores, guardedProjectionRoots(root.identity).map(root => root.path));
    root.copies.push(...swept.copies);
    if (swept.ignores.kind === "refused") state.diagnostics.push({ path: input.checkout, copy: null,
      mark: { reason: `Projection ignore guard refused: ${swept.ignores.reason}`, remedy: { text: swept.ignores.remedy } } });
    for (const left of swept.left) state.diagnostics.push({ path: left.path, copy: left.copy,
      mark: { reason: left.reason, remedy: left.remedy ?? { text: "Keep the aside copy until its edit is recovered or explicitly removed." } } });
    for (const copy of swept.swept) reportProjectionCopy(copy.path, copy.copy, copy.outcome);
    const recovered = swept.swept.map(each => each.path).filter(path => input.mode === "save" || !path.startsWith(".arc/completed/"));
    if (swept.index !== null) {
      await recheckProjectionResolution(root, swept.index, state.resolution);
      await writeBackProjectionFiles(root, swept.index, [...new Set([...files, ...recovered])].sort());
    }
    await root.refresh?.();
    await session.step();
    root.ready = true;
    return { kind: "ready", version: saved.result, discovered: root.discovered };
  } finally {
    if (root !== undefined) root.checkpoint = null;
    state.lockHeld = false;
  }
}

async function bindResolution(input: ProjectionCommandInput, index: ProjectionIndex | null): Promise<void> {
  if (input.mode === "save" && input.resolve !== undefined) {
    projectionProcessState().resolution = await selectProjectionResolution(input.store, index, input.resolve);
  }
}

async function bindRoot(input: ProjectionCommandInput, ports: ProjectionEnginePorts, location: ProjectionLocation,
  config: ProjectionConfiguration, session: ProjectionLockSession, unsent: Set<string>, links: readonly string[]): Promise<ProjectionRootState> {
  if (config.identity.status !== "identified") throw new Error("A projection root needs an identity");
  const state = projectionProcessState();
  state.history ??= createHistoryMemo(input.store);
  const layout = await readCheckoutLayoutContext(input.checkout, { fresh: true });
  const writer = await ports.writer();
  await session.step();
  const actor = await ports.actor(config.identity.identity);
  const checkpoint = async (): Promise<void> => {
    if (root.checkpoint === null) throw new Error("A projection mutation requires its worktree's lease");
    await root.checkpoint();
  };
  const context: ReadBackContext = { store: input.store, location, format: config.objectFormat, actor, writer, memo: state.history, versionRecoveries: [],
    protection: createProjectionProtection({ store: input.store, checkout: input.checkout, identity: config.identity.identity, exec: ports.exec, verb: input.mode ?? "write-back" }),
    verb: input.mode ?? "write-back", checkpoint, hooks: ports.hooks, takeIn: request => root.takeIn(request), onWrite: () => { root.changed = true; },
    report: diagnostic => {
      state.diagnostics.push(diagnostic);
      const intent = state.resolution;
      if (intent?.target?.path === diagnostic.path && diagnostic.copy === null && !intent.accepted
        && !diagnostic.mark.reason.startsWith("unshown-conflict:")) intent.refusal = diagnostic.mark;
    }, reportResolution: resolution => {
      state.resolutions.push(resolution);
      const intent = state.resolution;
      if (intent?.target?.resolution.kind === "stored" && sameReference(intent.target.resolution.reference, resolution.reference)) intent.accepted = true;
    },
    reportExplicitResolution: () => { if (state.resolution !== null) state.resolution.accepted = true; },
    recordBatch: batch => { root.copies.push(...batch.copies); root.removals.push(...batch.removals); } };
  const send = createWriteBackPort(context);
  const root: ProjectionRootState = { checkout: input.checkout, store: input.store, location, ports, context, identity: config.identity.identity,
    claim: layout.claim, layoutActive: layout.layoutActive, view: interpretProjectionView(config.view).view,
    blockedByLink: createProjectionLinkBoundary(links),
    checkpoint: session.step, copies: [], removals: [], unsent, discovered: [], changed: false,
    ready: false, writable: () => false, rights: bindProjectionRights(input.store, config.identity.identity, ports.exec, input.mode ?? "write-back"), takeIn: async request => {
      const denied = await root.rights?.(request);
      if (denied === undefined || denied === null) return send(request);
      root.unsent.add(request.path);
      context.report?.({ path: request.path, copy: request.copy, mark: denied });
      return refuseProjectionEdit(request.entry, denied);
    } };
  return root;
}

function fulfilled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
