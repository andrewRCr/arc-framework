/** Initialization performed inside the command's own projection lease. */
import { isDeepStrictEqual } from "node:util";
import { createHistoryMemo } from "./base-recovery.js";
import { readProjectionConfiguration } from "./configuration.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { commitProjectionIndex, readProjectionIndex } from "./index-file.js";
import { sweepAsideFolder, writableUnder } from "./sweep.js";
import { walkProjectionRoots } from "./engine-walk.js";
import { writeBackProjectionFiles } from "./engine-files.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import { PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths } from "../../layout/index.js";
import type { ProjectionCommandInput, ProjectionStart } from "./engine.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionLockSession } from "./lock.js";
import { reportProjectionCopy, reportProjectionLinks } from "./report.js";
import { selectProjectionResolution, recheckProjectionResolution } from "./save-resolution.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { reconcileProjectionLinks } from "./discovery-links.js";
import { bindProjectionRoot } from "./engine-binding.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { materializeProjectionRoot } from "./materialization.js";
import { checkoutHoldsProjection } from "./ownership.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import type { ProjectionRefreshRequest } from "./refresh.js";
import type { ProjectionIndex } from "./index-schema.js";

/** The writable command input retains its original rendering source beside any history-retry wrapper. */
export interface ProjectionStartInput extends ProjectionCommandInput { readonly source: import("./record-source.js").ProjectionSource }

/** Start independent reads together, drain them all, then sweep and take in files under the lease. */
export async function startUnderLease(input: ProjectionStartInput, ports: ProjectionEnginePorts,
  location: ProjectionLocation, session: ProjectionLockSession, unsent: Set<string>): Promise<ProjectionStart> {
  const state = projectionProcessState();
  let root: ProjectionRootState | undefined;
  try {
    await session.step();
    const disk = await readProjectionIndex(location, await checkoutHoldsProjection(input.checkout, location),
      { groups: input.mode === "save" ? "all" : "walked" });
    if (disk.kind === "no-projection") {
      await bindResolution(input, null);
      return { kind: "no-projection" };
    }
    const configuration = observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
    const version = input.store.version();
    const shared = walkProjectionRoots(input.checkout, PROJECTED_LIFECYCLE_ROOTS.filter(path => input.mode === "save" || path !== ".arc/completed"), ports.walkFs);
    const personal = configuration.then(config => config.identity.status === "no-identity" ? { files: [], links: [] }
      : walkProjectionRoots(input.checkout, projectedRootPaths(config.identity.identity).filter(path => path.startsWith(".arc/user/")), ports.walkFs));
    const read = await Promise.allSettled([configuration, version, shared, personal] as const);
    const config = fulfilled(read[0]);
    const pendingFiles = read[2].status === "fulfilled" ? read[2].value.files : [];
    if (config.identity.status === "no-identity") {
      const skip = { reason: "no-identity" as const, mark: { reason: `Projection disabled: ${config.identity.cause} identity.`, remedy: config.identity.remedy } };
      state.skip = skip;
      return { kind: "skipped", skip, pending: pendingFiles };
    }
    const saved = fulfilled(read[1]);
    const sharedWalk = fulfilled(read[2]), personalWalk = fulfilled(read[3]);
    const files = [...sharedWalk.files, ...personalWalk.files].sort();
    reportProjectionLinks([...sharedWalk.links, ...personalWalk.links]);
    await session.step();
    if (saved.status === "refused") return { kind: "refused", mark: { reason: saved.refusal.condition, remedy: saved.refusal.remedy } };
    await bindResolution(input, disk.kind === "index" ? disk.index : null);
    state.history ??= createHistoryMemo(input.store);
    root = await bindProjectionRoot({ ...input, ports, location, configuration: config, session, unsent, register: true,
      history: state.history, actor: await resolveProjectionActor(ports, location, config.identity.identity),
      links: [...sharedWalk.links, ...personalWalk.links] });
    if (disk.kind === "unusable") {
      const rebuilt = await materializeProjectionRoot({ root, source: input.source, configuration: config, version: saved.result,
        index: null, recovered: disk.header });
      return rebuilt.kind === "refused" ? { kind: "refused", mark: rebuilt.mark }
        : { kind: "ready", version: saved.result, discovered: root.discovered };
    }
    let index = await reconcileProjectionLinks(root, disk.index);
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
      index = await reconcileProjectionHandoffs(root, swept.index);
      await recheckProjectionResolution(root, index, state.resolution);
      index = await writeBackProjectionFiles(root, index, [...new Set([...files, ...recovered])].sort());
    }
    index = await resolveNewlyProjectedSubject(root, await updateProjection(root, { source: input.source, version: saved.result, index }));
    await commitProjectionIndex({ location, checkout: input.checkout, index, checkpoint: root.context.checkpoint });
    await session.step();
    root.ready = true;
    return { kind: "ready", version: saved.result, discovered: root.discovered };
  } finally {
    if (root !== undefined) root.checkpoint = null;
  }
}

async function updateProjection(root: ProjectionRootState, input: ProjectionRefreshRequest): Promise<{ index: ProjectionIndex; viewReprojectionAttempted: boolean }> {
  const viewReprojectionAttempted = root.reproject !== undefined && !isDeepStrictEqual(input.index.projectedUnder.view, root.view);
  const index = await root.reproject?.(input) ?? input.index;
  return { index: await root.refresh?.({ ...input, index }) ?? index, viewReprojectionAttempted };
}

async function resolveNewlyProjectedSubject(root: ProjectionRootState,
  updated: { index: ProjectionIndex; viewReprojectionAttempted: boolean }): Promise<ProjectionIndex> {
  const state = projectionProcessState(), intent = state.resolution;
  if (!updated.viewReprojectionAttempted || intent === null || intent.accepted || intent.target !== null || intent.selection !== "unmapped") return updated.index;
  const selected = await selectProjectionResolution(root.store, updated.index, intent.token);
  state.resolution = selected;
  if (selected.target === null) return updated.index;
  await recheckProjectionResolution(root, updated.index, selected);
  return selected.refusal === null ? writeBackProjectionFiles(root, updated.index, [selected.target.path]) : updated.index;
}

async function bindResolution(input: ProjectionCommandInput, index: ProjectionIndex | null): Promise<void> {
  if (input.mode === "save" && input.resolve !== undefined) {
    projectionProcessState().resolution = await selectProjectionResolution(input.store, index, input.resolve);
  }
}

function fulfilled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
