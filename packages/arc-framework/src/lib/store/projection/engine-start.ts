/** Initialization performed inside the command's own projection lease. */
import { createHistoryMemo } from "./base-recovery.js";
import { readProjectionConfiguration } from "./configuration.js";
import { guardedProjectionRoots } from "./ignore-guard.js";
import { readProjectionIndex } from "./index-file.js";
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
import type { ProjectionIndex } from "./index-schema.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { reconcileProjectionLinks } from "./discovery-links.js";
import { bindProjectionRoot } from "./engine-binding.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { materializeProjectionRoot } from "./materialization.js";
import { checkoutHoldsProjection } from "./ownership.js";

/** Start independent reads together, drain them all, then sweep and take in files under the lease. */
export async function startUnderLease(input: ProjectionCommandInput, ports: ProjectionEnginePorts,
  location: ProjectionLocation, session: ProjectionLockSession, unsent: Set<string>): Promise<ProjectionStart> {
  const state = projectionProcessState();
  state.lockHeld = true;
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
    await bindResolution(input, disk.kind === "index" ? disk.index : null);
    state.history ??= createHistoryMemo(input.store);
    root = await bindProjectionRoot({ ...input, ports, location, configuration: config, session, unsent, register: true,
      history: state.history, actor: await resolveProjectionActor(ports, location, config.identity.identity),
      links: [...sharedWalk.links, ...personalWalk.links] });
    if (disk.kind === "unusable") {
      const rebuilt = await materializeProjectionRoot({ root, source: input.store, configuration: config, version: saved.result,
        index: null, recovered: disk.header });
      return rebuilt.kind === "refused" ? { kind: "refused", mark: rebuilt.mark }
        : { kind: "ready", version: saved.result, discovered: root.discovered };
    }
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

function fulfilled<T>(result: PromiseSettledResult<T>): T {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}
