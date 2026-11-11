/** Initialization performed inside the command's own projection lease. */
import { isDeepStrictEqual } from "node:util";
import { createHistoryMemo } from "./base-recovery.js";
import { readProjectionConfiguration } from "./configuration.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { commitProjectionIndex } from "./index-file.js";
import { sweepAsideFolder, writableUnder, type SweepResult } from "./sweep.js";
import { launchProjectionStart, projectionStartEligible, type ProjectionWalkObservation } from "./start-observations.js";
import { writeBackProjectionFiles } from "./engine-files.js";
import { projectionProcessState, type ProjectionRootState } from "./process-state.js";
import type { ProjectionCommandInput, ProjectionStart } from "./engine.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionLocation } from "./location.js";
import type { ProjectionLockSession } from "./lock.js";
import { reportProjectionCopy, reportProjectionLinks } from "./report.js";
import { selectProjectionResolution, recheckProjectionResolution } from "./save-resolution.js";
import { reconcileProjectionLinks } from "./discovery-links.js";
import { bindProjectionRoot } from "./engine-binding.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { materializeProjectionRoot } from "./materialization.js";
import { reconcileProjectionHandoffs } from "./ownership-handoff.js";
import type { ProjectionRefreshRequest } from "./refresh.js";
import type { FileStat, ProjectionIndex } from "./index-schema.js";
import { recordProjectionSweep } from "./end-work.js";
import { projectionTimingNow, recordProjectionTiming, reportProjectionTripwires } from "./timings.js";

/** The writable command input retains its original rendering source beside any history-retry wrapper. */
export interface ProjectionStartInput extends ProjectionCommandInput { readonly source: import("./record-source.js").ProjectionSource }

/** Start independent reads together, drain them all, then sweep and take in files under the lease. */
export async function startUnderLease(input: ProjectionStartInput, ports: ProjectionEnginePorts,
  location: ProjectionLocation, session: ProjectionLockSession, unsent: Set<string>, startedAt: number): Promise<ProjectionStart> {
  const state = projectionProcessState();
  let root: ProjectionRootState | undefined;
  try {
    await session.step();
    if (!await projectionStartEligible(input.checkout, location)) {
      await bindResolution(input, null);
      return { kind: "no-projection" };
    }
    const pending = launchProjectionStart(input, ports, location);
    const read = await Promise.allSettled([pending.configuration, pending.version, pending.shared, pending.personal, pending.index] as const);
    const config = fulfilled(read[0]);
    const pendingFiles = read[2].status === "fulfilled" ? read[2].value.files : [];
    if (config.identity.status === "no-identity") {
      const skip = { reason: "no-identity" as const, mark: { reason: `Projection disabled: ${config.identity.cause} identity.`, remedy: config.identity.remedy } };
      state.skip = skip;
      return { kind: "skipped", skip, pending: pendingFiles };
    }
    const saved = fulfilled(read[1]);
    const disk = fulfilled(read[4]);
    if (disk.kind === "no-projection") return { kind: "no-projection" };
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
        index: null, recovered: disk.header, startTiming: startedAt });
      return rebuilt.kind === "refused" ? { kind: "refused", mark: rebuilt.mark }
        : { kind: "ready", version: saved.result, discovered: root.discovered };
    }
    let index = await reconcileProjectionLinks(root, disk.index);
    const beforeSweep = index;
    const swept = await sweepAsideFolder({ location, checkout: input.checkout, index, format: config.objectFormat,
      blockedByLink: root.blockedByLink,
      takeIn: root.takeIn, writer: root.context.writer, checkpoint: root.context.checkpoint,
      ignoreRules: config.ignoreRules, readIgnoreRules: async () => (await readProjectionConfiguration(ports.exec, input.checkout)).ignoreRules,
      guard: { root: input.checkout, identity: root.identity, exec: ports.execInput, fs: ports.fs } });
    root.writable = writableUnder(swept.ignores, guardedProjectionRoots(root.identity).map(root => root.path));
    recordProjectionSweep(root, swept);
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
      const observations = reusableStartStats({ original: disk.index, beforeSweep, index, swept, walks: [sharedWalk, personalWalk] });
      index = await writeBackProjectionFiles(root, index, [...new Set([...files, ...recovered])].sort(), observations);
    }
    index = await resolveNewlyProjectedSubject(root, await updateProjection(root, { source: input.source, version: saved.result, index }));
    index = await commitProjectionIndex({ location, checkout: input.checkout,
      index: recordProjectionTiming(index, "start", projectionTimingNow(ports) - startedAt), checkpoint: root.context.checkpoint });
    await session.step();
    reportProjectionTripwires(root, index);
    root.ready = true;
    return { kind: "ready", version: saved.result, discovered: root.discovered };
  } finally {
    if (root !== undefined) root.checkpoint = null;
  }
}

function reusableStartStats(input: { original: ProjectionIndex; beforeSweep: ProjectionIndex; index: ProjectionIndex;
  swept: SweepResult; walks: readonly ProjectionWalkObservation[] }): ReadonlyMap<string, FileStat | null> | undefined {
  if (input.original !== input.beforeSweep || input.index !== input.swept.index
    || input.swept.swept.length > 0 || input.swept.left.length > 0) return undefined;
  return new Map(input.walks.flatMap(walk => [...walk.stats]));
}

async function updateProjection(root: ProjectionRootState, input: ProjectionRefreshRequest): Promise<{ index: ProjectionIndex; viewReprojectionAttempted: boolean }> {
  const viewReprojectionAttempted = root.reproject !== undefined && !isDeepStrictEqual(input.index.projectedUnder.view, root.view);
  const index = await root.reproject?.(input) ?? input.index;
  return { index: await root.refresh?.({ ...input, index, publication: "caller" }) ?? index, viewReprojectionAttempted };
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
