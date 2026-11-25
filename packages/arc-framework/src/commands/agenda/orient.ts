/** Compile between-work discovery after synchronization and universal context. */
import { compileConcurrentWorkload } from "./advisories.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileSessionOrientation, compileUnconsumedSignals, orderOrientationSurfaces } from "./orientation.js";
import { compileSyncPrefix } from "./prefix.js";
import { carryAgendaAnswers } from "./progress.js";
import { compileUniversalReads } from "./reads.js";
import type { AgendaSignals, AgendaStep, SessionInitAgenda } from "./schema.js";
import { compileOrientRoutes } from "./routes.js";
import { compileSyncState } from "./sync-state.js";

/** Orient the current checkout and leave discovery decisions with the named method. */
export async function compileOrient(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const prefix = compileSyncPrefix(input);
  if (prefix.at(-1)?.type === "exec") return createSessionInitAgenda(input, { shape: "work-state" }, carryAgendaAnswers(input, prefix));
  const discovery = compileOrientDiscovery(input.envelope.config, input.signals);
  const surfaces = compileSessionOrientation(input, discovery.findings, compileSyncState(input), { seed: true });
  surfaces.push(...compileOrientRoutes(input));
  const workload = compileConcurrentWorkload(input);
  if (workload !== null) surfaces.push({ id: workload.surface, steps: [workload] });
  return createSessionInitAgenda(input, { shape: "work-state" }, carryAgendaAnswers(input, [
    ...prefix, ...await compileUniversalReads(input), ...(discovery.fragment === null ? [] : [discovery.fragment]), ...orderOrientationSurfaces(surfaces),
    { type: "gate", kind: "stop", autoProceed: false },
  ]));
}


/** Project discovery intent without inventing settings when its probe failed. */
export function compileOrientDiscovery(config: AgendaCompileInput["envelope"]["config"], signals: AgendaSignals): {
  fragment: Extract<AgendaStep, { type: "fragment" }> | null; findings: Extract<AgendaStep, { type: "note" }>[];
} {
  if (!config.ok) return { fragment: null, findings: compileUnconsumedSignals({ signals: signals.seed === undefined ? {} : { seed: signals.seed } }) };
  return { fragment: { type: "fragment", target: { kind: "method", name: "discover-next-work" }, args: {
    pmMode: config.value.settings["pm.mode"], protection: config.value.settings["branch.protection"],
    ...(signals.seed === undefined ? {} : { seed: signals.seed }),
  } }, findings: [] };
}
