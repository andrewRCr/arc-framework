/**
 * Assemble the in-flight-mine render slice from the oracle's output.
 *
 * Maps the identity-filtered in-flight work units (errands dropped — they carry
 * no State / Cohort / Priority) into the resolved {@link StatusViewRow} model the
 * render core consumes. Two resolutions happen here, the boundary between the
 * raw oracle facts and the view contract:
 *
 * - **Priority** narrows to the codified level, set only when the meta carried an
 *   explicit value so the render core's conditional column drops for an
 *   all-default slice.
 * - **Depends On** resolves to *unsatisfied in-flight* dependencies: a dep still
 *   present in the in-flight set is shown; a shipped or not-yet-started dep is
 *   absent from the set and renders as satisfied (em-dash). Resolution is scoped
 *   to the in-flight set the oracle surfaced — in solo mode that is the whole
 *   pipeline; full backlog-aware satisfaction is the deferred file-writer's job.
 *
 * @module
 */

import { validatePriority } from "../../commands/active/types.js";
import type { InFlightEntry, InFlightWorkUnit } from "../git/in-flight-derivation.js";

import type { StatusViewRow } from "./render.js";

/** Narrow an in-flight entry to a work unit (errands carry no render fields). */
function isWorkUnit(entry: InFlightEntry): entry is InFlightWorkUnit {
  return entry.kind === "work-unit";
}

/**
 * Build the in-flight-mine slice from oracle entries.
 *
 * @param entries - Oracle output (identity-filtered in-flight WUs and errands).
 * @returns Render rows for the in-flight work units, in oracle order.
 */
export function buildInFlightMineSlice(entries: readonly InFlightEntry[]): StatusViewRow[] {
  const workUnits = entries.filter(isWorkUnit);
  const inFlightNames = new Set(workUnits.map((wu) => wu.name));

  return workUnits.map((wu) => ({
    workUnit: wu.name,
    state: wu.state,
    ...(wu.priority !== undefined ? { priority: validatePriority(wu.priority) } : {}),
    dependsOn: wu.dependsOn.filter((dep) => inFlightNames.has(dep)),
    ...(wu.cohort !== undefined ? { cohort: wu.cohort } : {}),
  }));
}
