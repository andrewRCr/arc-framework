/** Materialization requested by a spawn through its command's selected engine. */
import type { ProjectionCommandInput } from "./engine.js";
import { projectionProcessState } from "./process-state.js";
import { createProjectionEnginePorts } from "./engine-ports.js";
import { locateProjection } from "./location.js";
import { withProjectionLock } from "./lock.js";
import { readProjectionConfiguration } from "./configuration.js";
import { observeProjectionConfiguration } from "./command-configuration.js";
import { bindProjectionRoot } from "./engine-binding.js";
import { resolveProjectionActor } from "./engine-actor.js";
import { createHistoryMemo } from "./base-recovery.js";
import { materializeProjectionRoot } from "./materialization.js";
import { readProjectionIndex } from "./index-file.js";

/** Run a bound spawn request; a process with no root hook remains dark. */
export async function materializeSpawnedProjection(checkout: string): Promise<void> {
  await projectionProcessState().materializeSpawn?.(checkout);
}

/** Bind after command start, which resets process state, retaining the command's selected store. */
export function bindSpawnMaterialization(input: ProjectionCommandInput): void {
  if (!input.store.capabilities.stateOffBranch || input.skipProjection) return;
  projectionProcessState().materializeSpawn = async checkout => {
    try { await materializeSpawn(input, checkout); }
    catch (error) { reportFailure(checkout, error instanceof Error ? error.message : String(error)); }
  };
}

async function materializeSpawn(input: ProjectionCommandInput, checkout: string): Promise<void> {
  const ports = input.ports?.() ?? createProjectionEnginePorts(checkout);
  const location = await locateProjection(checkout, ports);
  const result = await withProjectionLock(location, async session => {
    const configuration = await readProjectionConfiguration(ports.exec, checkout);
    if (configuration.identity.status !== "identified") return;
    const command = await observeProjectionConfiguration(input.checkout, () => readProjectionConfiguration(ports.exec, input.checkout));
    if (command.identity.status !== "identified" || command.identity.identity !== configuration.identity.identity) return;
    const version = await input.store.version();
    if (version.status === "refused") { reportFailure(checkout, version.refusal.condition, version.refusal.remedy.text); return; }
    const state = projectionProcessState();
    state.history ??= createHistoryMemo(input.store);
    const previous = state.roots.get(checkout);
    const root = await bindProjectionRoot({ ...input, checkout, ports, location, configuration, session, register: true, unsent: previous?.unsent,
      history: state.history, actor: await resolveProjectionActor(ports, location, configuration.identity.identity) });
    root.copies.push(...previous?.copies ?? []);
    root.removals.push(...previous?.removals ?? []);
    root.discovered.push(...previous?.discovered ?? []);
    root.changed = previous?.changed ?? false;
    root.spawned = true;
    try {
      const disk = await readProjectionIndex(location, true, { groups: "walked" });
      const materialized = await materializeProjectionRoot({ root, source: input.store, configuration, version: version.result,
        index: disk.kind === "index" ? disk.index : null, recovered: disk.kind === "unusable" ? disk.header : undefined });
      if (materialized.kind === "refused") root.context.report?.({ path: checkout, copy: null, mark: materialized.mark });
    } finally { root.checkpoint = null; }
  }, { invalidatePartition: true, ...(ports.maxWaitMs === undefined ? {} : { maxWaitMs: ports.maxWaitMs }) }, ports.lock);
  if (result.status !== "done") reportFailure(checkout, `Projection materialization could not acquire its lease (${result.status}).`);
}

function reportFailure(checkout: string, reason: string, remedy = "Retry an ARC command in the spawned worktree to materialize its projection."): void {
  projectionProcessState().diagnostics.push({ path: checkout, copy: null, mark: { reason, remedy: { text: remedy } } });
}
